"use client";

import { useActionState } from "react";
import { completeResetAction, type ResetFormState } from "@/lib/auth/reset-actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ResetFormState, FormData>(completeResetAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {state?.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. A short phrase is easier to remember than a cryptic password."
      />
      <Field
        label="Type it again"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
      />

      <SubmitButton pendingLabel="Setting…">Set my password and sign in</SubmitButton>
    </form>
  );
}
