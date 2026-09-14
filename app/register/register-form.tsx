"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * The choice of *how* you will sign in is made here rather than worked out from
 * what you type.
 *
 * It used to look for an `@`. That meant a username could never contain one,
 * for a reason a child would never see — so the question is asked instead, and
 * a username can now be anything she likes.
 *
 * Both options are always offered, because this form cannot know which kind of
 * invitation the code is until the server reads it. Somebody starting a family
 * who picks "a username" is refused with a sentence saying why, rather than
 * being shown a choice that was never really theirs.
 */
export function RegisterForm({ isFirstAccount }: { isFirstAccount: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(registerAction, null);
  const [kind, setKind] = useState<"email" | "username">("email");
  const asEmail = kind === "email";

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
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-hearth-200">How will you sign in?</span>
        <select
          name="handleKind"
          value={kind}
          onChange={(event) => setKind(event.target.value === "username" ? "username" : "email")}
          className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
        >
          <option value="email" className="bg-hearth-950">
            With an email address
          </option>
          <option value="username" className="bg-hearth-950">
            With a username — for a child with no email
          </option>
        </select>
        <span className="mt-1.5 block text-sm text-hearth-400">
          {asEmail
            ? "Whoever answers for a family needs an address — it is how they are reached if something goes wrong."
            : "Anything she can remember and type. No email is collected at all."}
        </span>
      </label>

      {/* `type="text"` on both, or the browser refuses a username before the
          server ever sees it. */}
      <Field
        label={asEmail ? "Email" : "Username"}
        name="handle"
        autoComplete="username"
        placeholder={asEmail ? "you@example.com" : undefined}
        error={state?.fieldErrors?.handle}
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
