"use client";

import { useActionState, useState } from "react";
import { undoLastTurnAction } from "@/lib/game/undo-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Takes back the last turn.
 *
 * Deliberately behind a confirmation. This deletes what the storyteller wrote
 * and what everyone typed, and a button that does that on one press — next to
 * the box a ten-year-old is typing into — will eventually be pressed by
 * accident.
 */
export function UndoTurn({ campaignId }: { campaignId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await undoLastTurnAction(prev, data);
    if (result?.error === "") {
      // A full reload rather than router.refresh(). Refreshing re-fetches the
      // server data but leaves the table's component state alone, so the
      // narration that was just streamed stays on screen after the turn that
      // produced it has been deleted. Undo is rare and deliberate; starting
      // the board from server truth is exactly what it should do.
      window.location.reload();
    }
    return result;
  }, null);

  if (!confirming) {
    return (
      <div className="mt-6 text-center">
        {state?.error ? (
          <div className="mb-3 text-left">
            <Alert>{state.error}</Alert>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300"
        >
          Take back the last turn
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      <p className="mb-1 text-hearth-100">Take back the last turn?</p>
      <p className="mb-4 text-sm text-hearth-400">
        What everyone said and what the storyteller wrote will be removed, and anything learned
        or picked up goes back to how it was. The turn before is untouched.
      </p>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Taking it back…">Yes, take it back</SubmitButton>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50"
        >
          Keep it
        </button>
      </div>
    </form>
  );
}
