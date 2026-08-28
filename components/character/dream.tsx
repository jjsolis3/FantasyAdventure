"use client";

import { useActionState, useState } from "react";
import {
  answerDreamAction,
  setAsideDreamAction,
  setDreamAction,
} from "@/lib/game/dream-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WISH_MAX, echoSummary } from "@/lib/game/dreams";
import { capitalise, pronounsOf, toHave } from "@/lib/game/pronouns";

export type DreamEchoView = {
  id: string;
  note: string;
  campaignTitle: string;
};

export type DreamView = {
  id: string;
  wish: string;
  echoes: DreamEchoView[];
} | null;

export type AnsweredDreamView = {
  id: string;
  wish: string;
  answeredNote: string | null;
  answeredInCampaignTitle: string | null;
};

/**
 * The one thing she wants that no single adventure can give her.
 *
 * Written in her own words and kept in them — the game never tidies this, never
 * rephrases it, and never suggests one. A wish somebody else worded is not the
 * thing that gets her back to the table.
 *
 * Sits high on the sheet, above the stats. It is the answer to "why am I
 * playing", and burying it under seven numbers would say the opposite.
 */
export function Dream({
  characterId,
  name,
  pronouns,
  dream,
  answered,
  yours,
  currentCampaignId,
}: {
  characterId: string;
  name: string;
  pronouns: string | null;
  dream: DreamView;
  /** Wishes that came true, newest first. The reason to keep playing, proven. */
  answered: AnsweredDreamView[];
  yours: boolean;
  /** The adventure they are in, so a wish that comes true records where. */
  currentCampaignId?: string;
}) {
  const they = pronounsOf(pronouns);
  const [writing, setWriting] = useState(false);

  const [setState, setAction] = useActionState<FormState, FormData>(setDreamAction, null);
  const [answerState, answerAction] = useActionState<FormState, FormData>(answerDreamAction, null);
  const [asideState, asideAction] = useActionState<FormState, FormData>(setAsideDreamAction, null);

  const error = setState?.error || answerState?.error || asideState?.error;

  return (
    <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-4">
      <h2 className="font-display mb-1 text-lg text-hearth-100">
        What {they.subject} {toHave(they.subject)} always wanted
      </h2>

      {error ? <Alert>{error}</Alert> : null}

      {dream && !writing ? (
        <>
          <p className="mt-2 text-lg leading-relaxed text-hearth-100 italic">“{dream.wish}”</p>
          <p className="mt-1 text-sm text-hearth-400">{echoSummary(dream.echoes.length)}</p>

          {/* The visible progress, and the whole reason a long wish is not just
              a sentence typed once. Newest last, so it reads as a trail. */}
          {dream.echoes.length > 0 ? (
            <ul className="mt-3 space-y-2 border-l border-hearth-700/50 pl-3">
              {dream.echoes.map((echo) => (
                <li key={echo.id} className="text-sm text-hearth-200/80">
                  {echo.note}
                  <span className="ml-1 text-xs text-hearth-500">· {echo.campaignTitle}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {yours ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {/* Only the family may end one. The storyteller has no route to
                  this at all — see `lib/game/dream-actions.ts`. */}
              <form action={answerAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="dreamId" value={dream.id} />
                {currentCampaignId ? (
                  <input type="hidden" name="campaignId" value={currentCampaignId} />
                ) : null}
                <input
                  name="note"
                  placeholder="How did it happen?"
                  className="w-56 rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-1.5 text-sm text-hearth-100 placeholder:text-hearth-600"
                />
                <SubmitButton variant="secondary" pendingLabel="…">
                  It came true
                </SubmitButton>
              </form>

              <button
                type="button"
                onClick={() => setWriting(true)}
                className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-300 hover:border-hearth-600 hover:text-hearth-100"
              >
                Change it
              </button>

              <form action={asideAction}>
                <input type="hidden" name="dreamId" value={dream.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-hearth-800 px-3 py-1.5 text-sm text-hearth-500 hover:text-hearth-300"
                >
                  Set it aside
                </button>
              </form>
            </div>
          ) : null}
        </>
      ) : null}

      {!dream || writing ? (
        yours ? (
          <form action={setAction} className="mt-2 space-y-2">
            <input type="hidden" name="characterId" value={characterId} />
            <p className="text-sm text-hearth-300/80">
              One thing {name} wants that no single adventure can give {they.object} — to find
              somebody, to see somewhere, to be believed about something. The storyteller will
              hear about it, and will let the world whisper about it now and then. It never
              comes true until you say it has.
            </p>
            <input
              name="wish"
              maxLength={WISH_MAX}
              defaultValue={dream?.wish ?? ""}
              placeholder="I want to find out who left me on the step."
              className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
            />
            <div className="flex gap-2">
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                {dream ? "Save it" : "Write it down"}
              </SubmitButton>
              {writing ? (
                <button
                  type="button"
                  onClick={() => setWriting(false)}
                  className="rounded-lg border border-hearth-800 px-3 py-1.5 text-sm text-hearth-500 hover:text-hearth-300"
                >
                  Never mind
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="mt-2 text-sm text-hearth-400">
            {capitalise(they.subject)} {toHave(they.subject)} not said yet.
          </p>
        )
      ) : null}

      {/* Proof the game keeps its promises. A shelf of wishes that came true is
          the strongest argument there is for writing down another one. */}
      {answered.length > 0 ? (
        <div className="mt-5 border-t border-hearth-800/60 pt-3">
          <h3 className="text-xs font-medium tracking-[0.18em] text-hearth-500 uppercase">
            Wishes that came true
          </h3>
          <ul className="mt-2 space-y-2">
            {answered.map((entry) => (
              <li key={entry.id} className="text-sm text-hearth-200/80">
                <span className="text-moss-400">“{entry.wish}”</span>
                {entry.answeredNote ? <span> — {entry.answeredNote}</span> : null}
                {entry.answeredInCampaignTitle ? (
                  <span className="ml-1 text-xs text-hearth-500">
                    · {entry.answeredInCampaignTitle}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
