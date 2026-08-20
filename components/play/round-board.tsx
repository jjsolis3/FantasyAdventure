"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { AbilityPicker } from "@/components/play/ability-picker";
import { FamilyMovePicker, type AvailableMove, type MoveChoice } from "./family-move-picker";
import { IdeaHints } from "./idea-hints";
import { TalkNudge } from "./talk-nudge";
import type { TableBriefing, YourAim } from "@/lib/game/briefing";
import { YourAims } from "./your-aim";
import type { PlayCharacter } from "./play-client";
import type { RoundView } from "@/lib/game/rounds";

/**
 * The waiting room: what the party sees while it answers from separate devices.
 *
 * Everyone sees the same board — who has answered, what they said, and how far
 * along the turn is — because the alternative is four people asking each other
 * "did it work?" in another app entirely.
 *
 * The turn starts itself when the last answer lands. Every browser tries; the
 * server hands it to exactly one of them, and the rest of this component is
 * about making the losing ones look like they meant it.
 */
export function RoundBoard({
  campaignId,
  party,
  yourCharacterIds,
  round,
  availableMoves,
  busy,
  briefing,
  yourAims,
  talkNudge,
  onRound,
  onTakeTurn,
  poke,
}: {
  campaignId: string;
  party: PlayCharacter[];
  yourCharacterIds: string[];
  round: RoundView | null;
  availableMoves: AvailableMove[];
  /** True while this browser is the one running the turn. */
  busy: boolean;
  /** What the table already knows — see `lib/game/briefing.ts`. */
  briefing: TableBriefing;
  /**
   * What this browser's player is quietly after.
   *
   * Safe on this board specifically because a card is only ever filled in by
   * the person who owns that adventurer, and these came down a path scoped to
   * that same account — so an aim is shown in her box and nowhere else, even
   * though the rest of the board is shared. See `yourAims`.
   */
  yourAims: YourAim[];
  /** Why now is a good moment to confer, or null — see `lib/game/talk.ts`. */
  talkNudge: string | null;
  onRound: (round: RoundView | null) => void;
  onTakeTurn: (roundId: string) => void;
  poke: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // What each girl is spending, alongside what she is typing. Cleared when she
  // sends, because the answer now carries it.
  const [spends, setSpends] = useState<Record<string, string | null>>({});
  // Whose plan each of your adventurers has said she is joining. Alongside the
  // draft rather than inside it, for the same reason the ability spend is.
  const [helps, setHelps] = useState<Record<string, string | null>>({});
  const [correction, setCorrection] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");

  // One automatic attempt per round from this browser. A second would only ever
  // race with the browser that already won, and a failed turn deliberately
  // stops starting itself so a broken model server is not asked forty times.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!round || busy) return;
    if (round.status !== "COLLECTING" || !round.startsItself) return;
    if (attempted.current === round.id) return;

    attempted.current = round.id;
    onTakeTurn(round.id);
  }, [round, busy, onTakeTurn]);

  /**
   * A new round starts from a blank page.
   *
   * Keyed on the round rather than kept in step with the server: a poll landing
   * mid-sentence must not overwrite what somebody is still typing, so the boxes
   * are local from the moment the round opens until the answer is sent.
   */
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!round || loaded.current === round.id) return;
    loaded.current = round.id;
    setCorrection(round.correction ?? "");
    setDrafts({});
  }, [round]);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setSending(true);
    setFailure("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        round?: RoundView | null;
        error?: string;
      };

      if (!response.ok) {
        setFailure(data.error ?? "That did not go through. Try again?");
        if (data.round !== undefined) onRound(data.round);
        return false;
      }

      if (data.round !== undefined) onRound(data.round);
      return true;
    } catch {
      setFailure("That did not go through. Try again?");
      return false;
    } finally {
      setSending(false);
      poke();
    }
  }

  // ---- Between rounds ------------------------------------------------------

  if (!round) {
    return (
      <div className="space-y-4">
        {failure ? <Alert>{failure}</Alert> : null}
        <TalkNudge reason={talkNudge} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={sending}
            onClick={() => post({ action: "open", mode: "ACTION" })}
            className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-40"
          >
            What do you do?
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => post({ action: "open", mode: "TALK" })}
            className="rounded-lg border border-hearth-700 px-5 py-2.5 text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-40"
          >
            Talk to each other
          </button>
        </div>
        <p className="text-sm text-hearth-500">
          Whoever starts the round, everybody answers it, and the story only moves once you are all
          in. <strong className="font-medium text-hearth-400">What do you do?</strong> is for
          trying something — it may need a dice roll.{" "}
          <strong className="font-medium text-hearth-400">Talk to each other</strong> is just
          talking: nothing is rolled and the story stays where it is.
        </p>
      </div>
    );
  }

  const talking = round.mode === "TALK";
  const answers = new Map(round.answers.map((answer) => [answer.characterId, answer]));
  const stalled =
    round.status === "RESOLVING" &&
    !busy &&
    round.claimedAt !== null &&
    Date.now() - new Date(round.claimedAt).getTime() > 6 * 60 * 1000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl text-hearth-100">
          {talking ? "Talking it over" : "What do you do?"}
          <span className="ml-2 text-sm text-hearth-400">round {round.number}</span>
        </h2>
        <p className="text-sm text-hearth-400" aria-live="polite">
          {round.everyoneIn
            ? "Everybody is in."
            : `Waiting for ${round.waitingFor.length} of ${round.partyIds.length}.`}
        </p>
      </div>

      {/* What this round is for, in the words somebody would use at a table.
          "Talking it over" and an empty box told a first-time player nothing:
          not what to write, not whether it was safe to write anything, and not
          what the two buttons underneath would do to them. */}
      <p className="text-sm text-hearth-400">
        {talking ? (
          <>
            Say something to each other, in your own voice. Nothing is rolled for and the story does
            not move — this is just talking, and it costs you nothing.
          </>
        ) : (
          <>
            Say what your adventurer <em>tries</em> to do. It does not have to work, and the ones
            that go wrong are usually the better story.
          </>
        )}
      </p>

      {round.retelling ? (
        <Alert tone="info">
          Telling that turn again. Everyone&rsquo;s words are back — change what you like, say what
          the storyteller got wrong, and send it when you are ready.
        </Alert>
      ) : null}

      {round.error ? <Alert>{round.error}</Alert> : null}
      {failure ? <Alert>{failure}</Alert> : null}

      <ul className="space-y-3">
        {party.map((character) => {
          const answer = answers.get(character.id);
          const mine = yourCharacterIds.includes(character.id);
          const editable = mine && round.status === "COLLECTING";

          return (
            <li
              key={character.id}
              data-character-id={character.id}
              className={`rounded-xl border p-4 ${
                answer
                  ? "border-moss-800/50 bg-moss-900/10"
                  : "border-hearth-800/60 bg-hearth-900/20"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-hearth-100">{character.name}</span>
                {character.yours ? null : (
                  <span className="text-xs text-hearth-500">{character.playedBy}</span>
                )}
                <span className={`text-sm ${answer ? "text-moss-400" : "text-hearth-500"}`}>
                  {answer ? (answer.waiting ? "waits and watches" : "ready") : "still thinking…"}
                </span>
              </div>

              {answer && !answer.waiting ? (
                <p className="mt-2 text-hearth-200/80 italic">{answer.text}</p>
              ) : null}

              {/* Said out loud on the card, because the whole value of
                  declaring it is that everybody can see it before the dice. */}
              {answer?.helpingCharacterId ? (
                <p className="mt-1 text-sm text-moss-400">
                  helping{" "}
                  {party.find((other) => other.id === answer.helpingCharacterId)?.name ??
                    "somebody"}
                </p>
              ) : null}

              {editable && answer ? (
                <button
                  type="button"
                  disabled={sending}
                  onClick={async () => {
                    setDrafts((current) => ({ ...current, [character.id]: answer.text }));
                    await post({ action: "withdraw", characterId: character.id });
                  }}
                  className="mt-2 text-sm text-hearth-400 underline underline-offset-4 hover:text-hearth-200 disabled:opacity-50"
                >
                  Change my answer
                </button>
              ) : null}

              {editable && !answer ? (
                <YourAnswer
                  campaignId={campaignId}
                  character={character}
                  talking={talking}
                  briefing={briefing}
                  yourAims={yourAims}
                  helping={helps[character.id] ?? null}
                  onHelp={(id) => setHelps((current) => ({ ...current, [character.id]: id }))}
                  // Only somebody who has already said what they are doing, and
                  // never herself.
                  joinable={party
                    .filter(
                      (other) =>
                        other.id !== character.id &&
                        answers.get(other.id) &&
                        !answers.get(other.id)?.waiting,
                    )
                    .map((other) => ({ id: other.id, name: other.name }))}
                  value={drafts[character.id] ?? ""}
                  spending={spends[character.id] ?? null}
                  sending={sending}
                  onChange={(text) => setDrafts((current) => ({ ...current, [character.id]: text }))}
                  onSpend={(key) => setSpends((current) => ({ ...current, [character.id]: key }))}
                  onReady={() =>
                    post({
                      action: "answer",
                      characterId: character.id,
                      helpingCharacterId: helps[character.id] ?? null,
                      text: drafts[character.id] ?? "",
                      waiting: false,
                      abilityKey: spends[character.id] ?? null,
                    })
                  }
                  onWait={() =>
                    post({ action: "answer", characterId: character.id, text: "", waiting: true })
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {talking || round.status !== "COLLECTING" ? null : (
        <FamilyMovePicker
          available={availableMoves}
          chosen={round.familyMove}
          onChoose={(move: MoveChoice | null) => post({ action: "move", familyMove: move })}
        />
      )}

      {round.retelling && round.status === "COLLECTING" ? (
        <label className="block rounded-lg border border-hearth-700/60 bg-hearth-950/40 p-4">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">
            What did the storyteller get wrong?
          </span>
          <textarea
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            onBlur={() => post({ action: "correction", correction })}
            rows={2}
            placeholder="Mira was humming to the creature, not to the goats."
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          />
          <span className="mt-1.5 block text-sm text-hearth-400">
            In your own words. The storyteller takes this as what really happened. Everyone at the
            table can see it.
          </span>
        </label>
      ) : null}

      {round.status === "RESOLVING" ? (
        <p className="flex items-center gap-3 text-hearth-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-hearth-400" />
          {busy ? "Telling the storyteller…" : "Somebody is telling the storyteller…"}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {/* Shown when the turn will not start itself: a retelling waits to be
            sent, and a turn that just failed waits to be asked again. */}
        {round.status === "COLLECTING" && round.everyoneIn && round.hasActions && !round.startsItself ? (
          <button
            type="button"
            disabled={sending || busy}
            onClick={async () => {
              if (round.retelling) await post({ action: "correction", correction });
              onTakeTurn(round.id);
            }}
            className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-40"
          >
            {round.error ? "Try again" : "Tell the storyteller"}
          </button>
        ) : null}

        {stalled ? (
          <button
            type="button"
            onClick={() => onTakeTurn(round.id)}
            className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50"
          >
            Nothing is happening — take the turn
          </button>
        ) : null}

        {round.status === "COLLECTING" ? (
          <button
            type="button"
            disabled={sending}
            onClick={() => post({ action: "cancel" })}
            className="rounded-lg px-4 py-2 text-hearth-400 hover:text-hearth-200 disabled:opacity-50"
          >
            Put this round away
          </button>
        ) : null}
      </div>

      {round.everyoneIn && !round.hasActions ? (
        <Alert tone="info">
          Everybody is waiting and watching, so nothing has happened yet. Somebody has to try
          something before the story can move.
        </Alert>
      ) : null}
    </div>
  );
}

function YourAnswer({
  campaignId,
  character,
  talking,
  briefing,
  yourAims,
  helping,
  onHelp,
  joinable,
  value,
  spending,
  sending,
  onChange,
  onSpend,
  onReady,
  onWait,
}: {
  campaignId: string;
  character: PlayCharacter;
  talking: boolean;
  briefing: TableBriefing;
  /** Everybody's this player owns; filtered to this card's below. */
  yourAims: YourAim[];
  /** Whose plan she has said she is joining, or null. */
  helping: string | null;
  onHelp: (characterId: string | null) => void;
  /** Everybody who has already answered — the only people there is a plan to join. */
  joinable: { id: string; name: string }[];
  value: string;
  spending: string | null;
  sending: boolean;
  onChange: (text: string) => void;
  onSpend: (key: string | null) => void;
  onReady: () => void;
  onWait: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      {/* Above her box, in her browser, and on nobody else's card. The whole
          point of a private aim is that she is the one keeping track of it —
          which she cannot do if the only place it is written down is a tab. */}
      {talking ? null : <YourAims aims={yourAims} characterId={character.id} />}

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && value.trim()) {
            event.preventDefault();
            onReady();
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

      {/* Only offered against somebody who has actually said what they are
          doing. "I'm helping" with nothing to help with is not a plan, and
          it is the version of this that would let two children farm a bond by
          pointing at each other. */}
      {talking || joinable.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-hearth-400">Helping:</span>
          <button
            type="button"
            onClick={() => onHelp(null)}
            className={`rounded-full border px-3 py-1 ${
              helping === null
                ? "border-hearth-500 text-hearth-100"
                : "border-hearth-800/70 text-hearth-400"
            }`}
          >
            nobody
          </button>
          {joinable.map((other) => (
            <button
              key={other.id}
              type="button"
              onClick={() => onHelp(other.id)}
              className={`rounded-full border px-3 py-1 ${
                helping === other.id
                  ? "border-moss-500 text-moss-300"
                  : "border-hearth-800/70 text-hearth-400"
              }`}
            >
              {other.name}
            </button>
          ))}
        </div>
      )}

      {talking ? null : (
        <IdeaHints
          campaignId={campaignId}
          characterId={character.id}
          onTheTable={briefing.onTheTable}
          known={briefing.known}
        />
      )}

      {/* Not offered while the table is only talking it over: nothing is being
          attempted, so there is nothing for a once-a-scene move to land on, and
          spending one there would just waste it. */}
      {talking ? null : (
        <AbilityPicker
          abilities={character.abilities ?? []}
          chosen={spending}
          onChoose={onSpend}
          disabled={sending}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={sending || value.trim().length === 0}
          onClick={onReady}
          className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-40"
        >
          I&rsquo;m ready
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={onWait}
          className="rounded-lg border border-hearth-800 px-4 py-2 text-hearth-400 hover:bg-hearth-800/40 hover:text-hearth-200 disabled:opacity-50"
        >
          {character.name} waits and watches
        </button>
      </div>

      {/* Which of the two does what. "I'm ready" is greyed out until there are
          words in the box, and a greyed-out button with no explanation reads as
          broken rather than as waiting for you. */}
      <p className="text-sm text-hearth-500">
        <strong className="font-medium text-hearth-400">I&rsquo;m ready</strong> sends what you
        wrote.{" "}
        <strong className="font-medium text-hearth-400">Waits and watches</strong> sits this one out
        — {talking ? "you listen instead" : "no roll, no risk"}. Either way the story waits until
        everybody has answered.
      </p>
    </div>
  );
}
