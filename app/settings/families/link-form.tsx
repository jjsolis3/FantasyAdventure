"use client";

import { useActionState } from "react";
import { redeemLinkCodeAction, type LinkFormState } from "@/lib/game/link-actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LinkForm() {
  const [state, formAction] = useActionState<LinkFormState, FormData>(redeemLinkCodeAction, null);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.done ? <Alert tone="success">{state.done}</Alert> : null}

      <Field
        label="Their family code"
        name="code"
        placeholder="KIN-XXXX-XXXX"
        hint="Ask the other family for theirs. It only has to be typed by one of you."
      />

      <SubmitButton pendingLabel="Linking…">Adventure together</SubmitButton>
    </form>
  );
}
