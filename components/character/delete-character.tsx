"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { deleteCharacterAction } from "@/lib/game/actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";

export type CharacterLoss = {
  level: number;
  xp: number;
  skills: number;
  items: number;
  ties: number;
  /** Adventures they are travelling in, and whether each is still going. */
  adventures: { id: string; title: string; finished: boolean }[];
};

/**
 * The one door out of the app that destroys anything, so it is deliberately
 * hard to walk through by accident.
 *
 * Three things stand in the way, in the order that matters. First it is not a
 * button at all until you ask for it. Then it says what is actually about to be
 * lost, counted from this character rather than described in general — "level 4,
 * two skills, three things they are carrying" is a sentence somebody reads;
 * "this cannot be undone" is a sentence everybody has learned to click past.
 * Only then does it accept the name, typed out.
 *
 * And before any of that, it offers the handover, because "somebody else plays
 * them now" is the reason most people arrive here, and a handover keeps
 * everything this screen is about to destroy.
 */
export function DeleteCharacter({
  characterId,
  characterName,
  loss,
}: {
  characterId: string;
  characterName: string;
  loss: CharacterLoss;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(deleteCharacterAction, null);
  const [asked, setAsked] = useState(false);
  const [typed, setTyped] = useState("");

  const matches = typed.trim().toLocaleLowerCase() === characterName.trim().toLocaleLowerCase();
  const unfinished = loss.adventures.filter((adventure) => !adventure.finished);

  if (!asked) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-hearth-400">
          Removing {characterName} deletes them and everything they have earned. If somebody else is
          going to play them, hand them over instead — that keeps all of it.
        </p>
        <button
          type="button"
          onClick={() => setAsked(true)}
          className="rounded-lg border border-red-900/60 px-4 py-2 font-medium text-red-200 transition-colors hover:bg-red-950/40"
        >
          Remove {characterName}…
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4">
        <p className="mb-3 font-medium text-red-100">
          Really remove {characterName}? This cannot be undone.
        </p>

        <p className="mb-2 text-sm text-red-200/80">What goes with them:</p>
        <ul className="space-y-1 text-sm text-red-200/70">
          <li>
            Level {loss.level} and {loss.xp} experience
          </li>
          {loss.skills > 0 ? (
            <li>
              {loss.skills} {loss.skills === 1 ? "skill" : "skills"} and the ranks earned in them
            </li>
          ) : null}
          {loss.items > 0 ? (
            <li>
              {loss.items} {loss.items === 1 ? "thing" : "things"} they are carrying
            </li>
          ) : null}
          {loss.ties > 0 ? (
            <li>
              {loss.ties} family {loss.ties === 1 ? "tie" : "ties"} and the bonds grown in them
            </li>
          ) : null}
          {loss.adventures.length > 0 ? (
            <li>
              Their place in {loss.adventures.map((adventure) => adventure.title).join(", ")}
            </li>
          ) : null}
        </ul>

        {unfinished.length > 0 ? (
          <p className="mt-3 text-sm text-red-100">
            {unfinished.length === 1
              ? `${unfinished[0].title} is still being played.`
              : `${unfinished.length} of those adventures are still being played.`}{" "}
            The story already knows {characterName}; the transcript will go on mentioning somebody
            who is no longer in the party.
          </p>
        ) : null}
      </div>

      <p className="text-sm text-hearth-400">
        Still the wrong door?{" "}
        <Link href={`/characters/${characterId}#hand-over`} className="text-hearth-300 underline hover:text-hearth-200">
          Hand {characterName} to another player
        </Link>{" "}
        instead, and nothing above is lost.
      </p>

      <input type="hidden" name="characterId" value={characterId} />

      <Field
        label={`Type ${characterName} to confirm`}
        name="confirmName"
        value={typed}
        onChange={setTyped}
        placeholder={characterName}
        error={state?.fieldErrors?.confirmName}
        autoComplete="off"
      />

      <div className="flex flex-wrap gap-3">
        {/* Disabled until the name matches, and checked again on the server —
            a confirmation that only exists in the browser is a suggestion. */}
        <button
          type="submit"
          disabled={!matches}
          className="rounded-lg border border-red-900/60 px-4 py-2 font-medium text-red-200 transition-colors hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove {characterName} for good
        </button>
        <button
          type="button"
          onClick={() => {
            setAsked(false);
            setTyped("");
          }}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50"
        >
          Keep them
        </button>
      </div>
    </form>
  );
}
