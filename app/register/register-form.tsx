"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function RegisterForm({ isFirstAccount }: { isFirstAccount: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(registerAction, null);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="Invite code"
        name="inviteCode"
        placeholder="HEARTH-XXXX-XXXX"
        error={state?.fieldErrors?.inviteCode}
        hint={
          isFirstAccount
            ? "This is the first account, so use the bootstrap code printed in the server logs."
            : "Ask whoever set up Hearthlight for a code."
        }
      />
      <Field
        label="What should we call you?"
        name="displayName"
        autoComplete="name"
        placeholder="Dad, Nana, Alex…"
        error={state?.fieldErrors?.displayName}
      />
      {/* One box, either kind of answer — `type="text"` rather than `email`,
          or the browser refuses a username before the server ever sees it. */}
      <Field
        label="How will you sign in?"
        name="handle"
        autoComplete="username"
        placeholder="you@example.com — or a username"
        error={state?.fieldErrors?.handle}
        hint="A grown-up should use an email address. A child can use a simple username like mira-b, with no email at all."
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state?.fieldErrors?.password}
        hint="At least 10 characters. A short phrase works well."
      />

      <div className="flex items-center justify-between gap-4 pt-1">
        <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
        <Link href="/login" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          Already have an account?
        </Link>
      </div>
    </form>
  );
}
