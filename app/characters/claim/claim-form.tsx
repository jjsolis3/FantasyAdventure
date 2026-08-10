"use client";

import { useActionState } from "react";
import { claimCharacterAction } from "@/lib/game/handover-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ClaimForm() {
  const [state, formAction] = useActionState<FormState, FormData>(claimCharacterAction, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="The code"
        name="code"
        placeholder="HAND-K3M9-PQ7T"
        error={state?.fieldErrors?.code}
        hint="Whoever built your adventurer can make one from their page. Case and spacing do not matter."
      />

      <SubmitButton pendingLabel="Taking them on…">Take them on</SubmitButton>
    </form>
  );
}
