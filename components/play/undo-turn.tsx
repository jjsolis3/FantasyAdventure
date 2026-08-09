"use client";

import { useState, useTransition } from "react";
import {
  markStoppingPointAction,
  retellLastTurnAction,
  undoLastTurnAction,
} from "@/lib/game/undo-actions";
import { Alert } from "@/components/ui";

/**
 * The two ways to take back a turn.
 *
 * They differ in intent, not in mechanism. **Undo** is "that turn shouldn't
 * have happened" — the table wants to do something else entirely. **Retell** is
 * "you misread us" — what everyone said still stands, but the storyteller
 * misunderstood it, so the words come back into the boxes and only the
 * correction has to be typed.
 *
 * Retell re-rolls the dice, which is deliberate rather than a shortcut. If the
 * storyteller misread an action, the check it chose was probably wrong for what
 * was actually being attempted — keeping that roll would preserve the mistake
 * it came from.
 *
 * Both sit behind a confirmation: they delete what everyone typed and what the
 * storyteller wrote, and they live near the box a child is typing into.
 */
export function UndoTurn({
  campaignId,
  canUndo,
  onRestore,
}: {
  campaignId: string;
  /** False before the first turn — stopping is still offered, undo is not. */
  canUndo: boolean;
  /** Puts the removed words back in the boxes so only the correction is typed. */
  onRestore: (actions: { characterId: string; text: string }[]) => void;
}) {
  const [open, setOpen] = useState<null | "undo" | "retell">(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function undo() {
    startTransition(async () => {
      const form = new FormData();
      form.set("campaignId", campaignId);
      const result = await undoLastTurnAction(null, form);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // A full reload rather than a refresh: refreshing re-fetches server data
      // but leaves the table's own state alone, so the narration that was just
      // streamed would stay on screen after the turn producing it was deleted.
      window.location.reload();
    });
  }

  /**
   * Marks where this evening ended.
   *
   * Not a confirmation-worthy action: it adds a line to the transcript and
   * removes nothing, so the cost of an accidental press is a stray divider.
   */
  function stopHere() {
    startTransition(async () => {
      const form = new FormData();
      form.set("campaignId", campaignId);
      const result = await markStoppingPointAction(null, form);
      if (result?.error) {
        setError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  function retell() {
    startTransition(async () => {
      const result = await retellLastTurnAction(campaignId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRestore(result.actions);
      setOpen(null);
    });
  }

  if (open === null) {
    return (
      <div className="mt-6 space-y-3 text-center">
        {error ? (
          <div className="text-left">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <button
            type="button"
            onClick={stopHere}
            disabled={pending}
            className="text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-50"
          >
            We&rsquo;ll stop here for today
          </button>
          {canUndo ? (
            <>
              <button
                type="button"
                onClick={() => setOpen("retell")}
                className="text-hearth-500 underline underline-offset-4 hover:text-hearth-300"
              >
                The storyteller got that wrong
              </button>
              <button
                type="button"
                onClick={() => setOpen("undo")}
                className="text-hearth-500 underline underline-offset-4 hover:text-hearth-300"
              >
                Take back the last turn
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const retelling = open === "retell";

  return (
    <div className="mt-6 rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-5">
      <p className="mb-1 text-hearth-100">
        {retelling ? "Tell the storyteller what it got wrong?" : "Take back the last turn?"}
      </p>
      <p className="mb-4 text-sm text-hearth-400">
        {retelling
          ? "The turn comes back and everyone's words go back in their boxes, so you only have to " +
            "add what was misunderstood. The dice are rolled again — if the storyteller misread " +
            "what someone was doing, it probably asked for the wrong roll too."
          : "What everyone said and what the storyteller wrote will be removed, and anything " +
            "learned or picked up goes back to how it was. The turn before is untouched."}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={retelling ? retell : undo}
          className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-50"
        >
          {pending ? "Taking it back…" : retelling ? "Yes, let us explain" : "Yes, take it back"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(null)}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-50"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
