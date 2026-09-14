"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestResetAction, type ResetFormState } from "@/lib/auth/reset-actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ForgotForm() {
  const [state, formAction] = useActionState<ResetFormState, FormData>(requestResetAction, null);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.done ? <Alert tone="success">{state.done}</Alert> : null}

      <Field
        label="Email"
        name="email"
        autoComplete="email"
        placeholder="you@example.com"
        hint="The address you sign in with."
      />

      <div className="flex items-center justify-between gap-4 pt-1">
        <SubmitButton pendingLabel="Sending…">Send me a link</SubmitButton>
        <Link href="/login" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
