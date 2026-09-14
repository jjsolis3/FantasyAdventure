"use client";

import { useActionState, useState } from "react";
import {
  changePasswordAction,
  changeSignInAction,
  updateProfileAction,
  type FormState,
} from "@/lib/auth/actions";
import { Alert, Field, SelectField } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const READING_LEVELS = [
  { value: "EARLY_READER", label: "Early reader — short sentences, simple words" },
  { value: "MIDDLE_GRADE", label: "Middle grade — the default for most tables" },
  { value: "TEEN", label: "Teen — richer vocabulary, more nuance" },
  { value: "FAMILY_MIXED", label: "Mixed ages — clear for the youngest, asides for the oldest" },
];

const TONES = [
  { value: "COZY", label: "Cozy — warm and low-stakes" },
  { value: "ADVENTUROUS", label: "Adventurous — real tension, still no cruelty" },
];

export function ProfileForm({
  displayName,
  defaultReadingLevel,
  defaultTone,
}: {
  displayName: string;
  defaultReadingLevel: string;
  defaultTone: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateProfileAction, null);
  const saved = state !== null && state.error === "";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Saved.</Alert> : null}

      <Field
        label="Display name"
        name="displayName"
        defaultValue={displayName}
        error={state?.fieldErrors?.displayName}
      />
      <SelectField
        label="Reading level"
        name="defaultReadingLevel"
        defaultValue={defaultReadingLevel}
        options={READING_LEVELS}
        hint="Sets how the Game Master writes. You can override this per adventure."
      />
      <SelectField label="Tone" name="defaultTone" defaultValue={defaultTone} options={TONES} />

      <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, null);
  const changed = state !== null && state.error === "";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {changed ? <Alert tone="success">Password changed. Any other signed-in devices have been signed out.</Alert> : null}

      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        error={state?.fieldErrors?.currentPassword}
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        error={state?.fieldErrors?.newPassword}
        hint="At least 10 characters."
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state?.fieldErrors?.confirmPassword}
      />

      <SubmitButton variant="secondary" pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}

/**
 * Changing the address or username you sign in with.
 *
 * Asks for your password, unlike a parent changing a child's. A session
 * somebody else has got hold of could otherwise rewrite the address and then
 * use the forgotten-password flow to keep the account for good.
 */
export function SignInForm({
  signIn,
  isUsername,
  mayUseUsername,
}: {
  signIn: string;
  isUsername: boolean;
  mayUseUsername: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(changeSignInAction, null);
  const [kind, setKind] = useState<"email" | "username">(isUsername ? "username" : "email");
  const saved = state !== null && state.error === "";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Saved. Use this from now on when you sign in.</Alert> : null}

      {mayUseUsername ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">Sign in with</span>
          <select
            name="handleKind"
            value={kind}
            onChange={(event) => setKind(event.target.value === "username" ? "username" : "email")}
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          >
            <option value="email" className="bg-hearth-950">
              An email address
            </option>
            <option value="username" className="bg-hearth-950">
              A username
            </option>
          </select>
          <span className="mt-1.5 block text-sm text-hearth-400">
            Changing the kind replaces the old one — an account has one or the other, never both.
          </span>
        </label>
      ) : (
        <input type="hidden" name="handleKind" value="email" />
      )}

      <Field
        label={kind === "email" ? "Email" : "Username"}
        name="handle"
        defaultValue={signIn}
        autoComplete="off"
        error={state?.fieldErrors?.handle}
      />
      {/* Named apart from the password form's own `currentPassword`, which sits
          on this same page — two fields with one name is a form that fills the
          wrong box, and it did. */}
      <Field
        label="Your password"
        name="signInPassword"
        type="password"
        autoComplete="current-password"
        error={state?.fieldErrors?.signInPassword}
        hint="Asked for because changing this changes how the account can be recovered."
      />

      <SubmitButton pendingLabel="Saving…">Save how I sign in</SubmitButton>
    </form>
  );
}
