"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type FormState } from "@/lib/auth/actions";
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
