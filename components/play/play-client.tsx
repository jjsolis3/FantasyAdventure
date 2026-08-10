"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { DiceCard, Transcript, TypedNarration, type DiceDetail, type TranscriptEntry } from "./transcript";
import { FamilyMovePicker, type AvailableMove, type MoveChoice } from "./family-move-picker";
import { IdeaHints } from "./idea-hints";
import { RoundBoard } from "./round-board";
import { TellMeToggle, useTurnAlerts } from "./turn-alerts";
import { UndoTurn } from "./undo-turn";
import { useCampaignState } from "./use-campaign-state";
import type { RoundView } from "@/lib/game/rounds";

export type PlayCharacter = {
  id: string;
  name: string;
  race: string;
  archetype: string;
  level: number;
  pronouns: string;
  /** The household answering for them. */
  playedBy: string;
  yours: boolean;
};

type Phase =
  | { kind: "idle" }
  | { kind: "asking"; index: number }
  | { kind: "review" }
  | { kind: "running"; stage: string; dice: DiceDetail[] }
  | { kind: "narrating"; text: string; dice: DiceDetail[] }
  | { kind: "failed"; message: string };

const STAGE_LABELS: Record<string, string> = {
  adjudicating: "The storyteller is considering what you did…",
  rolling: "Rolling the dice…",
  narrating: "Writing what happens next…",
  extracting: "Remembering what mattered…",
};

/** Reads an SSE body, calling `onEvent` for each complete frame. */
async function consumeEventStream(
  response: Response,
  onEvent: (event: string, data: Record<string, unknown>) => void,
) {
  if (!response.body) throw new Error("The server sent no response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; a chunk can end mid-frame.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      let name = "message";
      const dataLines: string[] = [];

      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;

      try {
        onEvent(name, JSON.parse(dataLines.join("\n")));
      } catch {
        // A malformed frame is not worth ending the turn over.
      }
    }
  }
}

export function PlayClient({
  campaignId,
  campaignTitle,
  status,
  party,
  initialEntries,
  availableMoves,
  canUndo,
  inputMode,
  yourCharacterIds,
  initialRound,
}: {
  campaignId: string;
  campaignTitle: string;
  status: string;
  party: PlayCharacter[];
  initialEntries: TranscriptEntry[];
  availableMoves: AvailableMove[];
  /** True once a turn has been played, so there is something to take back. */
  canUndo: boolean;
  /** Whether the party shares this screen or is answering from their own. */
  inputMode: string;
  /** Adventurers this player may answer for. */
  yourCharacterIds: string[];
  /** The round being collected, when the party is apart. */
  initialRound: RoundView | null;
}) {
  const router = useRouter();
  const apart = inputMode === "OWN_DEVICE";

  const [entries, setEntries] = useState<TranscriptEntry[]>(initialEntries);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [move, setMove] = useState<MoveChoice | null>(null);
  /** What the table says the last telling got wrong; sent with the retold turn. */
  const [correction, setCorrection] = useState("");
  /** True between taking a turn back to retell it and sending the retelling. */
  const [retelling, setRetelling] = useState(false);
  /**
   * True when the party is talking rather than acting.
   *
   * The same ask-everyone flow, sent to a different pipeline: talk costs one
   * model call, rolls nothing, and does not move the story on.
   */
  const [talking, setTalking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasBegun = status !== "SETUP";
  // A campaign only reaches COMPLETE when its final act closes. Without this
  // the table was asked "what do you do?" forever, past the ending.
  const [finished, setFinished] = useState(status === "COMPLETE");

  // Nothing may redraw the page underneath a turn that is being told. Both refs
  // are read from callbacks that outlive the render they were created in.
  const telling = phase.kind === "running" || phase.kind === "narrating";
  const tellingRef = useRef(false);
  tellingRef.current = telling;
  const pendingRefresh = useRef(false);

  /**
   * Watching the rest of the table.
   *
   * Runs whatever the input mode is: even round one screen, somebody may have a
   * second device open, and a page that quietly goes stale is worse than one
   * that was never live at all. A refresh waits for the telling to finish, so
   * it can never arrive in the middle of a narration.
   */
  const { state, round, applyRound, poke } = useCampaignState(campaignId, {
    initialRound,
    onChange: (next) => {
      if (next.status === "COMPLETE") setFinished(true);
      if (tellingRef.current) pendingRefresh.current = true;
      else router.refresh();
    },
  });

  useEffect(() => {
    if (telling || !pendingRefresh.current) return;
    pendingRefresh.current = false;
    router.refresh();
  }, [telling, router]);

  /**
   * Whether the table is waiting for *this* player specifically.
   *
   * Not "a round is open" — a round is open for everybody, and a nudge that
   * fires when it is somebody else's answer that is missing teaches people to
   * ignore the nudge.
   */
  const yoursOutstanding =
    round !== null && round.status === "COLLECTING"
      ? yourCharacterIds.filter(
          (id) =>
            round.partyIds.includes(id) &&
            !round.answers.some((answer) => answer.characterId === id),
        )
      : [];
  const waitingOnYou = apart && !telling && yoursOutstanding.length > 0;

  const alerts = useTurnAlerts({
    waiting: waitingOnYou,
    storyMoved: state?.turnCounter ?? 0,
    campaignTitle,
    campaignId,
  });

  /**
   * Adopts the transcript the server just re-rendered.
   *
   * Held back while a turn is being told, because the narration is on screen
   * twice at that moment — typing itself out below, and already committed to
   * the transcript above. The typed one is the one the table is reading.
   */
  const transcriptSignature = `${initialEntries.length}:${initialEntries.at(-1)?.id ?? ""}`;
  const adopted = useRef(transcriptSignature);
  useEffect(() => {
    if (telling || adopted.current === transcriptSignature) return;
    adopted.current = transcriptSignature;
    setEntries(initialEntries);
  }, [telling, transcriptSignature, initialEntries]);

  /**
   * The end of the telling: the last character has been typed out, so the words
   * become part of the transcript and the page goes back to waiting.
   *
   * Both changes are made together so there is no frame in which the paragraph
   * has left the typed block but not yet arrived in the transcript.
   */
  const finishNarration = useCallback(() => {
    adopted.current = transcriptSignature;
    setEntries(initialEntries);
    setPhase((current) => (current.kind === "narrating" ? { kind: "idle" } : current));
  }, [initialEntries, transcriptSignature]);

  /**
   * Runs a turn and plays its stream into the phase.
   *
   * Returns what the stream said rather than deciding what to do about it: a
   * turn from a shared screen and a turn taken on behalf of a round want the
   * same progress on screen and different things afterwards.
   */
  const stream = useCallback(
    async (body: Record<string, unknown>): Promise<{ ok: boolean; failed: string | null }> => {
      setPhase({ kind: "running", stage: "adjudicating", dice: [] });

      const response = await fetch(`/api/campaigns/${campaignId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // 409 is the ordinary outcome of two browsers reaching for the same
      // round; the caller decides whether that is worth mentioning.
      if (!response.ok) {
        if (response.status === 409) return { ok: false, failed: null };
        throw new Error(`The server replied ${response.status}.`);
      }

      let dice: DiceDetail[] = [];
      let failed: string | null = null;

      await consumeEventStream(response, (event, data) => {
        if (event === "stage") {
          setPhase((current) =>
            current.kind === "running" ? { ...current, stage: String(data.stage) } : current,
          );
        } else if (event === "dice") {
          dice = (data.checks as DiceDetail[]) ?? [];
          setPhase((current) => (current.kind === "running" ? { ...current, dice } : current));
        } else if (event === "narration") {
          setPhase({ kind: "narrating", text: String(data.text), dice });
        } else if (event === "done") {
          // The last act just closed. Said here rather than waiting for the
          // refresh, so the ending is not preceded by one more "what do you
          // do?" prompt.
          if (data.campaignComplete === true) setFinished(true);
        } else if (event === "error") {
          failed = String(data.message);
        }
      });

      return { ok: failed === null, failed };
    },
    [campaignId],
  );

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const { failed } = await stream(body);
        if (failed) {
          setPhase({ kind: "failed", message: failed });
          return;
        }

        // The server has already committed everything; refreshing pulls the
        // authoritative transcript rather than trusting what was streamed.
        setDrafts({});
        setMove(null);
        setCorrection("");
        setRetelling(false);
        setTalking(false);
        router.refresh();
      } catch (error) {
        setPhase({
          kind: "failed",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    },
    [router, stream],
  );

  /**
   * Takes the round the party has been filling in, if this browser is the one
   * the server picks.
   *
   * A 409 is the ordinary outcome, not a failure: it means another browser is
   * already running the turn, and this one goes back to watching. Telling the
   * player about it would be reporting on plumbing.
   */
  const takeTurn = useCallback(
    async (roundId: string) => {
      try {
        const { ok } = await stream({ mode: "round", roundId });
        poke();

        // Either another browser has it, or the turn failed and the round is
        // back to collecting with the reason on it. Both are the board's story
        // to tell, so this only stops the spinner.
        if (!ok) {
          setPhase({ kind: "idle" });
          return;
        }

        router.refresh();
      } catch (error) {
        setPhase({
          kind: "failed",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    },
    [poke, router, stream],
  );

  function startAsking() {
    setPhase({ kind: "asking", index: 0 });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function advance(index: number) {
    if (index + 1 < party.length) {
      setPhase({ kind: "asking", index: index + 1 });
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setPhase({ kind: "review" });
    }
  }

  const filledActions = party
    .map((character) => ({ characterId: character.id, text: (drafts[character.id] ?? "").trim() }))
    .filter((action) => action.text.length > 0);

  // ---- Rendering -----------------------------------------------------------

  const outstandingNames = yoursOutstanding
    .map((id) => party.find((character) => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-8">
      {waitingOnYou ? (
        <div
          role="status"
          className="rounded-xl border border-hearth-500/60 bg-hearth-800/50 px-4 py-3"
        >
          <p className="font-medium text-hearth-100">
            {outstandingNames.length === 1
              ? `It's your turn — ${outstandingNames[0]} has not said what they are doing.`
              : `It's your turn — ${outstandingNames.join(" and ")} have not said what they are doing.`}
          </p>
          <p className="text-sm text-hearth-300">The rest of the party is waiting for you.</p>
        </div>
      ) : null}

      <Transcript entries={entries} />

      {phase.kind === "narrating" ? (
        <div>
          {phase.dice.length > 0 ? (
            <div className="mb-5 space-y-2">
              {phase.dice.map((dice, index) => (
                <DiceCard key={index} dice={dice} />
              ))}
            </div>
          ) : null}
          <div className="font-display text-lg">
            <TypedNarration text={phase.text} onDone={finishNarration} />
          </div>
        </div>
      ) : null}

      <div className="border-t border-hearth-800/50 pt-6">
        {phase.kind === "running" ? (
          <div className="space-y-4">
            <p className="flex items-center gap-3 text-hearth-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-hearth-400" />
              {STAGE_LABELS[phase.stage] ?? "Thinking…"}
            </p>
            {phase.dice.length > 0 ? (
              <div className="space-y-2">
                {phase.dice.map((dice, index) => (
                  <DiceCard key={index} dice={dice} animate />
                ))}
              </div>
            ) : null}
            <p className="text-xs text-hearth-500">
              A local storyteller thinks slowly. This can take a minute.
            </p>
          </div>
        ) : phase.kind === "failed" ? (
          <div className="space-y-4">
            <Alert>
              {phase.message}
              <br />
              <span className="text-red-200/70">
                Nothing was lost — the adventure is exactly where you left it.
              </span>
            </Alert>
            <button
              type="button"
              onClick={() => setPhase({ kind: "idle" })}
              className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50"
            >
              Try again
            </button>
          </div>
        ) : finished ? (
          <div className="rounded-xl border border-moss-700/50 bg-moss-900/20 p-6 text-center">
            <h2 className="font-display mb-2 text-2xl text-hearth-100">The end</h2>
            <p className="text-hearth-300">
              This adventure is complete. The whole story is above, and everything your
              adventurers learned and found stays with them.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link
                href={`/campaigns/${campaignId}/journal`}
                className="inline-block rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500"
              >
                Read it back from the beginning
              </Link>
              <Link
                href="/campaigns"
                className="inline-block rounded-lg border border-hearth-700 px-5 py-2.5 font-medium text-hearth-200 hover:bg-hearth-800/50"
              >
                Choose the next adventure
              </Link>
            </div>
          </div>
        ) : status === "PAUSED" ? (
          <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-6 text-center">
            <h2 className="font-display mb-2 text-2xl text-hearth-100">Paused</h2>
            <p className="text-hearth-300">
              Whoever set this adventure up has put it down for now. Everything is exactly where you
              left it, and they can pick it back up from the adventure&rsquo;s page.
            </p>
          </div>
        ) : !hasBegun ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => run({ mode: "begin" })}
              className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500"
            >
              Begin the adventure
            </button>
            {apart ? (
              <p className="text-sm text-hearth-500">
                Anyone can start it. The opening scene appears on everybody&rsquo;s screen.
              </p>
            ) : null}
          </div>
        ) : apart ? (
          <RoundBoard
            campaignId={campaignId}
            party={party}
            yourCharacterIds={yourCharacterIds}
            round={round}
            availableMoves={availableMoves}
            busy={telling}
            onRound={applyRound}
            onTakeTurn={takeTurn}
            poke={poke}
          />
        ) : phase.kind === "asking" ? (
          <AskCharacter
            campaignId={campaignId}
            talking={talking}
            character={party[phase.index]}
            index={phase.index}
            total={party.length}
            value={drafts[party[phase.index].id] ?? ""}
            inputRef={inputRef}
            onChange={(text) =>
              setDrafts((current) => ({ ...current, [party[phase.index].id]: text }))
            }
            onNext={() => advance(phase.index)}
            onBack={
              phase.index > 0 ? () => setPhase({ kind: "asking", index: phase.index - 1 }) : undefined
            }
          />
        ) : phase.kind === "review" ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl text-hearth-100">Ready?</h2>

            {filledActions.length === 0 ? (
              <Alert tone="info">Nobody has said what they are doing yet.</Alert>
            ) : (
              <ul className="space-y-2">
                {party.map((character) => {
                  const text = (drafts[character.id] ?? "").trim();
                  if (!text) return null;
                  return (
                    <li key={character.id} className="border-l-2 border-hearth-700 pl-4">
                      <span className="text-sm font-medium text-hearth-300">{character.name}</span>
                      <p className="text-hearth-200/80 italic">{text}</p>
                    </li>
                  );
                })}
              </ul>
            )}

            {retelling ? (
              <label className="block rounded-lg border border-hearth-700/60 bg-hearth-950/40 p-4">
                <span className="mb-1.5 block text-sm font-medium text-hearth-200">
                  What did the storyteller get wrong?
                </span>
                <textarea
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                  rows={2}
                  placeholder="Mira was humming to the creature, not to the goats."
                  className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
                />
                <span className="mt-1.5 block text-sm text-hearth-400">
                  In your own words. The storyteller takes this as what really happened.
                </span>
              </label>
            ) : null}

            {talking ? null : (
              <FamilyMovePicker available={availableMoves} chosen={move} onChoose={setMove} />
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={filledActions.length === 0}
                onClick={() =>
                  run(
                    talking
                      ? { mode: "talk", actions: filledActions }
                      : {
                          mode: "turn",
                          actions: filledActions,
                          familyMove: move,
                          correction: correction.trim() || null,
                        },
                  )
                }
                className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-40"
              >
                Tell the storyteller
              </button>
              <button
                type="button"
                onClick={() => setPhase({ kind: "asking", index: 0 })}
                className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50"
              >
                Change something
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setTalking(false);
                startAsking();
              }}
              className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500"
            >
              What do you do?
            </button>
            <button
              type="button"
              onClick={() => {
                setTalking(true);
                startAsking();
              }}
              className="rounded-lg border border-hearth-700 px-5 py-2.5 text-hearth-200 hover:bg-hearth-800/50"
            >
              Talk to each other
            </button>
          </div>
        )}
      </div>

      {hasBegun && !finished && phase.kind !== "running" ? (
        <UndoTurn
          campaignId={campaignId}
          canUndo={canUndo}
          onRestore={(actions) => {
            setEntries((current) => current.slice(0, -countTurnEntries(current)));

            if (apart) {
              // The server has already opened a round with everybody's words in
              // it, so the retelling happens where the rest of the party can see
              // it rather than in one person's boxes.
              setPhase({ kind: "idle" });
              poke();
              return;
            }

            setDrafts(Object.fromEntries(actions.map((a) => [a.characterId, a.text])));
            setRetelling(true);
            setPhase({ kind: "review" });
          }}
        />
      ) : null}

      {apart && !finished ? (
        <TellMeToggle
          wanted={alerts.wanted}
          permission={alerts.permission}
          onAsk={alerts.askToBeTold}
          onStop={alerts.stopBeingTold}
        />
      ) : null}
    </div>
  );
}

/**
 * How many trailing entries belong to the turn just taken back.
 *
 * The server has already deleted them; this only stops them lingering on screen
 * while the table types its correction. Everything from the last run of player
 * actions onward is one turn's worth.
 */
function countTurnEntries(entries: TranscriptEntry[]): number {
  let count = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    count += 1;
    if (entries[index].type === "PLAYER_ACTION") {
      // Keep walking back over the rest of this turn's actions.
      while (index - 1 >= 0 && entries[index - 1].type === "PLAYER_ACTION") {
        index -= 1;
        count += 1;
      }
      break;
    }
  }
  return count;
}

function AskCharacter({
  campaignId,
  talking,
  character,
  index,
  total,
  value,
  onChange,
  onNext,
  onBack,
  inputRef,
}: {
  campaignId: string;
  talking: boolean;
  character: PlayCharacter;
  index: number;
  total: number;
  value: string;
  onChange: (text: string) => void;
  onNext: () => void;
  onBack?: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-hearth-400">
          {index + 1} of {total}
        </p>
        <h2 className="font-display text-2xl text-hearth-100">
          {character.name}, {talking ? "what do you say?" : "what do you do?"}
        </h2>
        <p className="mt-1 text-sm text-hearth-400">
          {talking
            ? "Talking to each other. Nothing is being attempted, so nothing can go wrong — plan, wonder, argue."
            : "Anything at all. Talk, look, try something silly — the storyteller will go with it."}
        </p>
      </div>

      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, shift+enter makes a new line — the shape everyone
          // already expects from chat apps.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onNext();
          }
        }}
        rows={3}
        placeholder={
          talking
            ? "Do you think it's lost? Maybe if we're quiet it will come out…"
            : "I sit down in the barley and start humming, like I do with the goats…"
        }
        className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/50 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
      />

      {talking ? null : (
        <IdeaHints
          campaignId={campaignId}
          characterId={character.id}
          onPick={(idea) => {
            onChange(idea);
            inputRef.current?.focus();
          }}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
        >
          {index + 1 < total ? "Next" : "Done"}
        </button>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg px-4 py-2 text-hearth-400 hover:text-hearth-200"
        >
          {character.name} waits and watches
        </button>
      </div>
    </div>
  );
}

