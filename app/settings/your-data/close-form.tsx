"use client";

import { useActionState, useState } from "react";
import { closeHouseholdAction, type CloseFormState } from "@/lib/game/close-actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Closing the family, with the name typed out.
 *
 * The button stays disabled until the name matches — which is a courtesy, not
 * the safeguard. `mayCloseHousehold` checks the same thing server-side, because
 * a disabled attribute is a suggestion and this is the most destructive thing
 * in the application.
 *
 * Typing the name rather than ticking a box, for the reason the reset screen
 * already established: the failure this guards against is not somebody who did
 * not mean it, it is somebody with two tabs open who meant it about the *other*
 * family. Typing the name means having read which one this is.
 */
export function CloseHousehold({ householdName }: { householdName: string }) {
  const [state, action] = useActionState<CloseFormState, FormData>(closeHouseholdAction, null);
  const [typed, setTyped] = useState("");

  const matches = typed.trim().toLocaleLowerCase() === householdName.trim().toLocaleLowerCase();

  return (
    <form action={action} className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-hearth-200">
          Type <span className="text-hearth-100">{householdName}</span> to confirm
        </span>
        <input
          name="confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          aria-label={`Type ${householdName} to confirm closing this family`}
          className="w-full rounded-lg border border-red-900/50 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-red-700 focus:ring-2 focus:ring-red-800/30 focus:outline-none"
        />
      </label>

      <SubmitButton variant="danger" disabled={!matches} pendingLabel="Closing…">
        Close this family for good
      </SubmitButton>
    </form>
  );
}
