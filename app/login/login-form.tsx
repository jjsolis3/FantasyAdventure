"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, null);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={state?.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state?.fieldErrors?.password}
      />

      <div className="flex items-center justify-between gap-4 pt-1">
        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
        <Link href="/register" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          Have an invite code?
        </Link>
      </div>
    </form>
  );
}
