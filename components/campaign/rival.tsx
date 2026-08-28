"use client";

import { useActionState, useEffect, useState } from "react";
import { retireRivalAction, saveRivalAction } from "@/lib/game/rival-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ABOUT_MAX, NAME_MAX, WANTS_MAX, standings } from "@/lib/game/rivals";

export type RivalView = {
  name: string;
  about: string;
  wants: string;
  partyAhead: number;
  rivalAhead: number;
  meetings: { id: string; note: string; outcome: string; campaignTitle: string }[];
} | null;

/**
 * The person who keeps turning up.
 *
 * The scoreboard is the loudest thing on the card, because it is the reason
 * this is a rivalry rather than a recurring extra. A ten-year-old who can see
 * "you 3, him 1" wants a fourth adventure in a way that no amount of good
 * characterisation produces on its own.
 */
export function Rival({ rival }: { rival: RivalView }) {
  const [editing, setEditing] = useState(false);
  const [saveState, save] = useActionState<FormState, FormData>(saveRivalAction, null);
  const [retireState, retire] = useActionState<FormState, FormData>(retireRivalAction, null);

  // Leave the form once the save lands. Without this a family that pressed
  // "change them", edited, and saved stayed staring at the same form with no
  // sign anything had happened — the server component re-rendered underneath,
  // but this component's own `editing` flag is client state and nothing was
  // clearing it.
  useEffect(() => {
    if (saveState?.error === "") setEditing(false);
  }, [saveState]);

  const error = saveState?.error || retireState?.error;

  return (
    <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-4">
      <h2 className="font-display mb-1 text-lg text-hearth-100">Somebody who keeps turning up</h2>

      {error ? <Alert>{error}</Alert> : null}

      {rival && !editing ? (
        <>
          <p className="mt-2">
            <span className="font-display text-xl text-hearth-50">{rival.name}</span>
          </p>
          <p className="mt-1 text-sm text-hearth-200/80">{rival.about}</p>
          <p className="mt-1 text-sm text-hearth-300">
            <span className="text-hearth-500">Always after: </span>
            {rival.wants}
          </p>

          {/* The scoreboard, and the biggest thing on the card. */}
          <div className="mt-4 flex items-baseline gap-4 rounded-lg border border-hearth-800/60 bg-hearth-950/40 p-3">
            <span className="font-display text-3xl text-moss-400">{rival.partyAhead}</span>
            <span className="text-sm text-hearth-500">you</span>
            <span className="font-display text-3xl text-amber-400">{rival.rivalAhead}</span>
            <span className="text-sm text-hearth-500">{rival.name}</span>
          </div>
          <p className="mt-1.5 text-sm text-hearth-300" aria-live="polite">
            {standings(rival.partyAhead, rival.rivalAhead, rival.name)}
          </p>

          {rival.meetings.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-l border-hearth-700/50 pl-3">
              {rival.meetings.map((meeting) => (
                <li key={meeting.id} className="text-sm text-hearth-200/80">
                  {meeting.note}
                  <span className="ml-1 text-xs text-hearth-500">· {meeting.campaignTitle}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-300 hover:border-hearth-600 hover:text-hearth-100"
            >
              Change them
            </button>
            <form action={retire}>
              <button
                type="submit"
                className="rounded-lg border border-hearth-800 px-3 py-1.5 text-sm text-hearth-500 hover:text-hearth-300"
              >
                We are done with them
              </button>
            </form>
          </div>
        </>
      ) : (
        <form action={save} className="mt-2 space-y-2">
          <p className="text-sm text-hearth-300/80">
            Somebody who wants the same things you do and keeps getting there first. Not
            dangerous and never frightening — the storyteller is told so plainly. Just
            unbearably pleased with themselves, and very hard to beat.
          </p>
          <input
            name="name"
            maxLength={NAME_MAX}
            defaultValue={rival?.name ?? ""}
            placeholder="Bex Underhill"
            className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
          />
          <input
            name="about"
            maxLength={ABOUT_MAX}
            defaultValue={rival?.about ?? ""}
            placeholder="A boy with a very good coat who has never once admitted to being wrong."
            className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
          />
          <input
            name="wants"
            maxLength={WANTS_MAX}
            defaultValue={rival?.wants ?? ""}
            placeholder="To be the one who found it, and to be asked about it afterwards."
            className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
          />
          <div className="flex gap-2">
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              {rival ? "Save them" : "Give them a rival"}
            </SubmitButton>
            {editing ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-hearth-800 px-3 py-1.5 text-sm text-hearth-500 hover:text-hearth-300"
              >
                Never mind
              </button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
