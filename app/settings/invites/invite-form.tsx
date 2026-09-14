"use client";

import { useActionState } from "react";
import { createInviteAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function InviteForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createInviteAction, null);
  const created = state !== null && state.error === "";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {created ? <Alert tone="success">Invite created — it is at the top of the list below.</Alert> : null}

      <Field
        label="Who is this for?"
        name="note"
        required={false}
        placeholder="Grandma, Uncle Ben…"
        error={state?.fieldErrors?.note}
        hint="Optional. Just a reminder for you."
      />
      <Field
        label="Expires after (days)"
        name="expiresInDays"
        type="number"
        required={false}
        placeholder="Leave blank for no expiry"
        error={state?.fieldErrors?.expiresInDays}
      />

      <SubmitButton pendingLabel="Creating…">Create invite code</SubmitButton>
    </form>
  );
}
