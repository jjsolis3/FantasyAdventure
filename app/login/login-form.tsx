"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction, type FormState } from "@/lib/auth/actions";
import type { HandleKind } from "@/lib/auth/handle";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * One page, and a button for the other kind of sign-in.
 *
 * The box used to be labelled "Email or username" and the server worked out
 * which by looking for an `@`. Two things were wrong with that: a child had to
 * read a label about email to type something that is not email, and a username
 * could never contain an at-sign for a reason she would never see.
 *
 * So the page *says* which it is asking for, and the button changes it. The
 * choice travels as a hidden field and decides which column is searched — no
 * inspection of the text anywhere.
 *
 * A button rather than a second page, deliberately. It relabels in place, so
 * there is no page load and a half-typed password survives the change of mind;
 * and there is one form with one error path rather than two to keep in step.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, null);
  const [kind, setKind] = useState<HandleKind>("email");
  const asEmail = kind === "email";

  return (
    <form action={formAction} className="space-y-5">
      {/* Where they were headed before being asked to sign in. Checked again on
          the server — see `safeNext` — because a hidden field is only a hint. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input type="hidden" name="handleKind" value={kind} />

      {state?.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label={asEmail ? "Email" : "Username"}
        name="handle"
        // `type="text"` for both. `type="email"` would have the browser refuse a
        // username before the server ever saw it.
        autoComplete="username"
        placeholder={asEmail ? "you@example.com" : undefined}
        error={state?.fieldErrors?.handle}
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hearth-800/50 pt-4">
        <button
          type="button"
          onClick={() => setKind(asEmail ? "username" : "email")}
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          {asEmail ? "I sign in with a username" : "I sign in with an email address"}
        </button>

        {/* Only on the email side: a child has no address to send a link to, and
            offering her one would be a dead end. Her parent sets her password. */}
        {asEmail ? (
          <Link href="/forgot" className="text-sm text-hearth-300 underline hover:text-hearth-200">
            Forgotten your password?
          </Link>
        ) : null}
      </div>
    </form>
  );
}
