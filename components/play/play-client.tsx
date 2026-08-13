"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { DiceCard, Transcript, TypedNarration, type DiceDetail, type TranscriptEntry } from "./transcript";
import { AbilityPicker, type AvailableAbility } from "@/components/play/ability-picker";
import { FamilyMovePicker, type AvailableMove, type MoveChoice } from "./family-move-picker";
import { IdeaHints } from "./idea-hints";
import { NarratorControls } from "./narrator-controls";
import { RoundBoard } from "./round-board";
import { usePlayTab } from "./play-layout";
import { TellMeToggle, useTurnAlerts } from "./turn-alerts";
import { useNarrator } from "./use-narrator";
import { UndoTurn } from "./undo-turn";
import { RollPanel } from "./roll-panel";
import type { AwaitedRoll } from "@/lib/game/table-dice";
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
  /**
   * The once-a-scene and once-a-chapter moves that are hers, spent ones marked.
   *
   * Worked out on the server so the table is never offered something it cannot
   * have. The turn checks again before it commits — this is so the buttons tell
   * the truth, not so the rule holds.
   */
  abilities?: AvailableAbility[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "asking"; index: number }
  | { kind: "review" }
  | { kind: "running"; stage: string; dice: DiceDetail[] }
  /** Stopped, with the storyteller waiting to be told what the dice said. */
  | { kind: "rolling"; awaited: AwaitedRoll[]; error: string | null; busy: boolean }
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
  whatNow,
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
  /**
   * The question the last passage left the table with.
   *
   * The single most-missed thing on this screen: a passage ended, two buttons
   * appeared, and nothing in between said the story was now waiting on a
   * person. Grown-ups hesitated and children waited to be told.
   */
  whatNow: string | null;
}) {
  const router = useRouter();
  const apart = inputMode === "OWN_DEVICE";

  const [entries, setEntries] = useState<TranscriptEntry[]>(initialEntries);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // What each character is spending this turn. Chosen while she is being asked
  // rather than at review, so the person typing decides per character rather
  // than once for the table.
  const [spends, setSpends] = useState<Record<string, string | null>>({});
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
   * The storyteller's voice.
   *
   * Fed from two places on purpose. The browser running the turn hears the
   * narration as it arrives down the stream, which is the moment it should
   * start talking; every other screen only ever sees it appear in the refreshed
   * transcript. The narrator ignores a passage it has already read, so whichever
   * happens first is the one that speaks.
   */
  const narrator = useNarrator();
  const { speakOnce, markSpoken } = narrator;

  // Opening a page mid-adventure must not read the whole evening back. Whatever
  // is already on screen counts as heard.
  const primed = useRef(false);
  if (!primed.current) {
    primed.current = true;
    markSpoken(lastNarration(initialEntries));
  }

  useEffect(() => {
    if (phase.kind === "narrating") speakOnce(phase.text);
  }, [phase, speakOnce]);

  useEffect(() => {
    const latest = lastNarration(entries);
    if (latest) speakOnce(latest);
  }, [entries, speakOnce]);

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
    async (
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; failed: string | null; awaiting: AwaitedRoll[] }> => {
      setPhase({ kind: "running", stage: "adjudicating", dice: [] });

      const response = await fetch(`/api/campaigns/${campaignId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // 409 is the ordinary outcome of two browsers reaching for the same
      // round; the caller decides whether that is worth mentioning.
      if (!response.ok) {
        if (response.status === 409) return { ok: false, failed: null, awaiting: [] };
        throw new Error(`The server replied ${response.status}.`);
      }

      let dice: DiceDetail[] = [];
      let failed: string | null = null;
      let awaiting: AwaitedRoll[] = [];

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
          // The turn stopped rather than finished: the table is rolling its own
          // dice and the storyteller is waiting to be told what they said.
          if (Array.isArray(data.awaiting) && data.awaiting.length > 0) {
            awaiting = data.awaiting as AwaitedRoll[];
          }
          // The last act just closed. Said here rather than waiting for the
          // refresh, so the ending is not preceded by one more "what do you
          // do?" prompt.
          if (data.campaignComplete === true) setFinished(true);
        } else if (event === "error") {
          failed = String(data.message);
        }
      });

      return { ok: failed === null, failed, awaiting };
    },
    [campaignId],
  );

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const { failed, awaiting } = await stream(body);
        if (failed) {
          setPhase({ kind: "failed", message: failed });
          return;
        }

        // Half a turn. Nothing has been committed and nothing is cleared —
        // the drafts stay exactly where they are, because a die under the sofa
        // must not cost anybody the sentence they wrote.
        if (awaiting.length > 0) {
          rollsAwaited.current = awaiting;
          setPhase({ kind: "rolling", awaited: awaiting, error: null, busy: false });
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

  // A page opened — or reloaded, or a second phone joining — while the dice are
  // on the table. The ask lives on the server precisely so this works: whoever
  // wanders in halfway sees the same question everybody else is looking at.
  useEffect(() => {
    let live = true;

    void fetch(`/api/campaigns/${campaignId}/rolls`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { awaiting?: AwaitedRoll[] } | null) => {
        const awaiting = data?.awaiting ?? [];
        if (!live || awaiting.length === 0) return;

        rollsAwaited.current = awaiting;
        // Only from a standing start. A browser mid-turn is already showing
        // something truer than this reply, which was fetched before it began.
        setPhase((current) => (current.kind === "idle" ? { kind: "rolling", awaited: awaiting, error: null, busy: false } : current));
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [campaignId]);

  // Kept beside the phase rather than read out of it, because the phase moves
  // to "running" the moment the numbers are sent — and if that run fails, the
  // ask has to come back exactly as it was.
  const rollsAwaited = useRef<AwaitedRoll[]>([]);

  /** Sends what the table rolled, and lets the rest of the turn happen. */
  const sendRolls = useCallback(
    async (rolls: { index: number; value: number }[]) => {
      setPhase((current) => (current.kind === "rolling" ? { ...current, busy: true, error: null } : current));

      try {
        const response = await fetch(`/api/campaigns/${campaignId}/rolls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rolls }),
        });
        if (!response.ok) throw new Error(`The server replied ${response.status}.`);

        let dice: DiceDetail[] = [];
        let failed: string | null = null;

        await consumeEventStream(response, (event, data) => {
          if (event === "stage") {
            setPhase({ kind: "running", stage: String(data.stage), dice });
          } else if (event === "dice") {
            dice = (data.checks as DiceDetail[]) ?? [];
            setPhase({ kind: "running", stage: "narrating", dice });
          } else if (event === "narration") {
            setPhase({ kind: "narrating", text: String(data.text), dice });
          } else if (event === "done") {
            if (data.campaignComplete === true) setFinished(true);
          } else if (event === "error") {
            failed = String(data.message);
          }
        });

        if (failed) {
          // Back to the dice rather than to a dead end: the numbers are still
          // on the table and the ask is still on the server, so this is a
          // retry rather than a lost turn.
          setPhase((current) =>
            current.kind === "running" || current.kind === "rolling"
              ? { kind: "rolling", awaited: rollsAwaited.current, error: failed, busy: false }
              : current,
          );
          return;
        }

        setDrafts({});
        setMove(null);
        setCorrection("");
        setRetelling(false);
        setTalking(false);
        poke();
        router.refresh();
      } catch (error) {
        setPhase({
          kind: "rolling",
          awaited: rollsAwaited.current,
          error: error instanceof Error ? error.message : "Something went wrong.",
          busy: false,
        });
      }
    },
    [campaignId, poke, router],
  );

  /** Puts the dice back down and hands the actions back to be rewritten. */
  const dropRolls = useCallback(async () => {
    await fetch(`/api/campaigns/${campaignId}/rolls`, { method: "DELETE" }).catch(() => {});
    setPhase({ kind: "review" });
    poke();
  }, [campaignId, poke]);

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
        const { ok, awaiting } = await stream({ mode: "round", roundId });
        poke();

        // Half a turn, taken on behalf of a party answering from four phones.
        // The round stays open and claimed; what happens next is dice.
        if (awaiting.length > 0) {
          rollsAwaited.current = awaiting;
          setPhase({ kind: "rolling", awaited: awaiting, error: null, busy: false });
          return;
        }

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
    .map((character) => ({
      characterId: character.id,
      text: (drafts[character.id] ?? "").trim(),
      abilityKey: spends[character.id] ?? null,
    }))
    .filter((action) => action.text.length > 0);

  // ---- Bringing the right thing into view ----------------------------------

  /**
   * Where the answering happens, and where a new passage lands.
   *
   * Both are below a wall of text that grows every turn, and neither used to
   * move the page: a passage arrived and the reader was left looking at the top
   * of the previous one, a round opened and nothing said so. Scrolling only
   * happens on a *transition* — a new passage, a new round — so it never fights
   * somebody who has deliberately scrolled back to reread something.
   */
  const actionRef = useRef<HTMLDivElement>(null);
  const narrationRef = useRef<HTMLDivElement>(null);
  const { setTab } = usePlayTab();

  function reveal(target: HTMLElement | null) {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const narrating = phase.kind === "narrating";
  useEffect(() => {
    if (narrating) reveal(narrationRef.current);
  }, [narrating]);

  const openRoundId = round && round.status === "COLLECTING" ? round.id : null;
  const revealedRound = useRef<string | null>(openRoundId);
  useEffect(() => {
    if (!openRoundId || revealedRound.current === openRoundId) return;
    revealedRound.current = openRoundId;
    reveal(actionRef.current);
  }, [openRoundId]);

  /** Bring somebody back to the story, from whichever tab they are on. */
  const goToAction = useCallback(() => {
    setTab("story");
    // After the panel has been shown; scrolling to a hidden element does nothing.
    setTimeout(() => reveal(actionRef.current), 50);
  }, [setTab]);

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

      <NarratorControls narrator={narrator} />

      <Transcript entries={entries} onSpeak={narrator.supported ? narrator.say : undefined} />

      {phase.kind === "narrating" ? (
        <div ref={narrationRef} className="scroll-mt-32">
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

      <div ref={actionRef} className="scroll-mt-32 border-t border-hearth-800/50 pt-6">
        {/* The bridge from the passage to the people reading it. Only while the
            table is idle: mid-turn this is last turn's question, and answering
            a question the story has moved past is worse than being asked
            nothing at all. */}
        {whatNow && phase.kind === "idle" && hasBegun && !finished && status !== "PAUSED" ? (
          <p className="font-display mb-5 text-lg text-hearth-100">{whatNow}</p>
        ) : null}

        {/* Ahead of every other phase, because when the dice are on the table
            the dice are the only thing happening. */}
        {phase.kind === "rolling" ? (
          <RollPanel
            awaited={phase.awaited}
            busy={phase.busy}
            error={phase.error}
            onSubmit={sendRolls}
            onCancel={dropRolls}
          />
        ) : phase.kind === "running" ? (
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
            spending={spends[party[phase.index].id] ?? null}
            inputRef={inputRef}
            onChange={(text) =>
              setDrafts((current) => ({ ...current, [party[phase.index].id]: text }))
            }
            onSpend={(key) =>
              setSpends((current) => ({ ...current, [party[phase.index].id]: key }))
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
          <div className="space-y-3">
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
            <p className="text-sm text-hearth-500">
              <strong className="font-medium text-hearth-400">What do you do?</strong> is for trying
              something — it may need a dice roll.{" "}
              <strong className="font-medium text-hearth-400">Talk to each other</strong> is just
              talking: nothing is rolled and the story stays where it is. Everybody gets asked in
              turn.
            </p>
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

      {hasBegun && !finished && status !== "PAUSED" ? (
        <ActionBar
          telling={telling}
          waitingOnYou={waitingOnYou}
          outstandingNames={outstandingNames}
          round={round}
          apart={apart}
          onGo={goToAction}
        />
      ) : null}
    </div>
  );
}

/**
 * What is happening, and the way back to doing something about it.
 *
 * Pinned to the bottom of the window on a phone, and nowhere at all on a
 * laptop, where the story and the controls are on screen together anyway.
 *
 * It deliberately holds no controls of its own beyond the one that scrolls you
 * to them. A second "what do you do?" button would mean two places to press for
 * the same thing and two states to keep in step; what was actually missing was
 * never a button, it was knowing whether the story was waiting on *you* without
 * having to scroll past a passage to find out.
 *
 * Portalled to the body because this component lives inside the story panel —
 * which is the one that gets hidden when somebody switches to Party or Quests.
 * `position: fixed` does not save an element whose ancestor is `display: none`,
 * and a status bar that vanishes on the two tabs where you cannot see the
 * story is exactly backwards.
 *
 * The spacer stays behind in the flow, where it is needed: without it the bar
 * sits on top of the last few lines of the page, which on the one screen where
 * the last few lines are the controls would be a fine joke and a bad idea.
 */
function ActionBar({
  telling,
  waitingOnYou,
  outstandingNames,
  round,
  apart,
  onGo,
}: {
  telling: boolean;
  waitingOnYou: boolean;
  outstandingNames: string[];
  round: RoundView | null;
  apart: boolean;
  onGo: () => void;
}) {
  const { tag, message } = (() => {
    if (telling) return { tag: "…", message: "The storyteller is writing." };
    if (waitingOnYou) {
      return {
        tag: "You",
        message: `${outstandingNames.join(" and ")} ${outstandingNames.length === 1 ? "has" : "have"} not answered.`,
      };
    }
    if (apart && round && round.status === "COLLECTING") {
      return round.everyoneIn
        ? { tag: "Ready", message: "Everybody is in." }
        : {
            tag: "Round",
            message: `Waiting for ${round.waitingFor.length} of ${round.partyIds.length}.`,
          };
    }
    return { tag: "Turn", message: "It is the party's move." };
  })();

  // Portals need a document, which the server render does not have.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const bar = (
    <div className="print-hide fixed inset-x-0 bottom-0 z-40 border-t border-hearth-800/70 bg-hearth-950/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <p className="min-w-0 flex-1 text-sm" aria-live="polite">
          <span className="text-hearth-400">{tag}</span>{" "}
          <span className="text-hearth-100">{message}</span>
        </p>
        <button
          type="button"
          onClick={onGo}
          className="shrink-0 rounded-lg bg-hearth-600 px-4 py-2 text-sm font-medium text-hearth-50 hover:bg-hearth-500"
        >
          {waitingOnYou ? "Answer" : "Go to the story"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="h-20 lg:hidden" aria-hidden />
      {mounted ? createPortal(bar, document.body) : null}
    </>
  );
}

/**
 * How many trailing entries belong to the turn just taken back.
 *
 * The server has already deleted them; this only stops them lingering on screen
 * while the table types its correction. Everything from the last run of player
 * actions onward is one turn's worth.
 */
/** The most recent thing the storyteller said, or null before it has said any. */
function lastNarration(entries: TranscriptEntry[]): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].type === "NARRATION") return entries[index].content;
  }
  return null;
}

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
  spending,
  onChange,
  onSpend,
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
  spending: string | null;
  onChange: (text: string) => void;
  onSpend: (key: string | null) => void;
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

      {/* Not offered while the table is only talking it over: nothing is being
          attempted, so a once-a-scene move has nothing to land on. */}
      {talking ? null : (
        <AbilityPicker
          abilities={character.abilities ?? []}
          chosen={spending}
          onChoose={onSpend}
        />
      )}

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

