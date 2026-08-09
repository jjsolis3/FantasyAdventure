"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { DiceCard, Transcript, TypedNarration, type DiceDetail, type TranscriptEntry } from "./transcript";
import { FamilyMovePicker, type AvailableMove, type MoveChoice } from "./family-move-picker";
import { UndoTurn } from "./undo-turn";

export type PlayCharacter = {
  id: string;
  name: string;
  race: string;
  archetype: string;
  level: number;
  pronouns: string;
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
}: {
  campaignId: string;
  campaignTitle: string;
  status: string;
  party: PlayCharacter[];
  initialEntries: TranscriptEntry[];
  availableMoves: AvailableMove[];
  /** True once a turn has been played, so there is something to take back. */
  canUndo: boolean;
}) {
  const router = useRouter();

  const [entries, setEntries] = useState<TranscriptEntry[]>(initialEntries);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [move, setMove] = useState<MoveChoice | null>(null);
  /** What the table says the last telling got wrong; sent with the retold turn. */
  const [correction, setCorrection] = useState("");
  /** True between taking a turn back to retell it and sending the retelling. */
  const [retelling, setRetelling] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasBegun = status !== "SETUP";
  // A campaign only reaches COMPLETE when its final act closes. Without this
  // the table was asked "what do you do?" forever, past the ending.
  const [finished, setFinished] = useState(status === "COMPLETE");

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setPhase({ kind: "running", stage: "adjudicating", dice: [] });

      try {
        const response = await fetch(`/api/campaigns/${campaignId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
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
        router.refresh();
      } catch (error) {
        setPhase({
          kind: "failed",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    },
    [campaignId, router],
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

  return (
    <div className="space-y-8">
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
            <TypedNarration text={phase.text} />
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
            <Link
              href="/campaigns"
              className="mt-4 inline-block rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500"
            >
              Choose the next adventure
            </Link>
          </div>
        ) : !hasBegun ? (
          <button
            type="button"
            onClick={() => run({ mode: "begin" })}
            className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500"
          >
            Begin the adventure
          </button>
        ) : phase.kind === "asking" ? (
          <AskCharacter
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

            <FamilyMovePicker available={availableMoves} chosen={move} onChoose={setMove} />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={filledActions.length === 0}
                onClick={() =>
                  run({
                    mode: "turn",
                    actions: filledActions,
                    familyMove: move,
                    correction: correction.trim() || null,
                  })
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
          <button
            type="button"
            onClick={startAsking}
            className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500"
          >
            What do you do?
          </button>
        )}
      </div>

      {canUndo && !finished && phase.kind !== "running" ? (
        <UndoTurn
          campaignId={campaignId}
          onRestore={(actions) => {
            setDrafts(Object.fromEntries(actions.map((a) => [a.characterId, a.text])));
            setRetelling(true);
            setEntries((current) => current.slice(0, -countTurnEntries(current)));
            setPhase({ kind: "review" });
          }}
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
  character,
  index,
  total,
  value,
  onChange,
  onNext,
  onBack,
  inputRef,
}: {
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
          {character.name}, what do you do?
        </h2>
        <p className="mt-1 text-sm text-hearth-400">
          Anything at all. Talk, look, try something silly — the storyteller will go with it.
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
        placeholder="I sit down in the barley and start humming, like I do with the goats…"
        className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/50 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
      />

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

