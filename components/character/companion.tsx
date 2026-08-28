"use client";

import { useActionState, useEffect, useState } from "react";
import { releaseCompanionAction, saveCompanionAction } from "@/lib/game/companion-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { KIND_MAX, KNACK_MAX, NAME_MAX, closenessNote } from "@/lib/game/companions";

export type CompanionView = {
  name: string;
  kind: string;
  knack: string;
  closeness: number;
  foundInCampaignTitle: string;
} | null;

/**
 * Something small that comes along.
 *
 * Deliberately plain. The pull here is the creature itself and the number of
 * chapters it has been through — not a card full of statistics, which is what
 * would happen if a companion were built out of the pieces the game already
 * had. A wooden owl with a name and one talent is a friend; a wooden owl with
 * seven stats is a second character sheet nobody asked for.
 */
export function Companion({
  characterId,
  companion,
  yours,
}: {
  characterId: string;
  companion: CompanionView;
  yours: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saveState, save] = useActionState<FormState, FormData>(saveCompanionAction, null);
  const [goState, release] = useActionState<FormState, FormData>(releaseCompanionAction, null);

  // Leave the form once the save lands — the same client-state trap the rival
  // and dream cards were both written into.
  useEffect(() => {
    if (saveState?.error === "") setEditing(false);
  }, [saveState]);

  const error = saveState?.error || goState?.error;

  if (!yours && !companion) return null;

  return (
    <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-4">
      <h2 className="font-display mb-1 text-lg text-hearth-100">Who comes along</h2>

      {error ? <Alert>{error}</Alert> : null}

      {companion && !editing ? (
        <>
          <p className="mt-2">
            <span className="font-display text-xl text-hearth-50">{companion.name}</span>
            <span className="ml-2 text-sm text-hearth-300">{companion.kind}</span>
          </p>
          <p className="mt-1 text-sm text-hearth-200/80">
            <span className="text-hearth-500">Good at: </span>
            {companion.knack}
          </p>
          <p className="mt-2 text-sm text-moss-400">{closenessNote(companion)}</p>
          {companion.foundInCampaignTitle ? (
            <p className="mt-0.5 text-xs text-hearth-500">
              Found in {companion.foundInCampaignTitle}.
            </p>
          ) : null}

          {yours ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-300 hover:border-hearth-600 hover:text-hearth-100"
              >
                Change them
              </button>
              <form action={release}>
                <input type="hidden" name="characterId" value={characterId} />
                <button
                  type="submit"
                  className="rounded-lg border border-hearth-800 px-3 py-1.5 text-sm text-hearth-500 hover:text-hearth-300"
                >
                  Let them go
                </button>
              </form>
            </div>
          ) : null}
        </>
      ) : (
        /* The field names are prefixed, and not for tidiness. This card sits on
           the character sheet, which already carries an edit form with its own
           `input[name="name"]` — and two inputs called "name" on one page are
           ambiguous to anything selecting by name. The browser suite found it
           the hard way: a rename filled this box instead of the one it meant,
           and the character quietly kept its old name. */
        <form action={save} className="mt-2 space-y-2">
          <input type="hidden" name="characterId" value={characterId} />
          <p className="text-sm text-hearth-300/80">
            One small thing that travels with them. The storyteller will keep it in the story
            and honour what it is good at — and nothing ever happens to it. It is never hurt,
            never taken and never lost.
          </p>
          <input
            name="companionName"
            maxLength={NAME_MAX}
            defaultValue={companion?.name ?? ""}
            placeholder="Woody"
            className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
          />
          <input
            name="companionKind"
            maxLength={KIND_MAX}
            defaultValue={companion?.kind ?? ""}
            placeholder="a wooden owl who rides on her shoulder"
            className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
          />
          <input
            name="companionKnack"
            maxLength={KNACK_MAX}
            defaultValue={companion?.knack ?? ""}
            placeholder="seeing in the dark"
            className="w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-700"
          />
          <div className="flex gap-2">
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              {companion ? "Save them" : "They have somebody"}
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
