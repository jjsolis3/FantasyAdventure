"use client";

import { useActionState } from "react";
import { createInviteAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field, SelectField } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Writing an invitation into your own house.
 *
 * There is one kind of code on this screen and there is no picker, because
 * there is nothing to pick. A family invites the people it wants playing
 * alongside it — a grandparent, a cousin, a friend of the children's — and that
 * is the whole of what a family may hand out. Admitting a *new family* is a
 * different act with a different cost, and it lives on `/admin/invites` where
 * whoever runs Hearthlight can see all of them at once.
 *
 * The picker used to be here, shown to platform administrators only. That put
 * the one decision about how many families exist on the screen a parent uses to
 * invite their nine-year-old, visible to exactly one account, which is how a
 * thing gets forgotten.
 *
 * Hiding it was never the defence in any case. `planInvite` refuses a
 * `NEW_HOUSEHOLD` grant from anybody who does not run the installation, whether
 * or not a form offered it, and refuses a household id aimed at anybody else's
 * family the same way.
 */
export function InviteForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createInviteAction, null);
  const created = state !== null && state.error === "";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {created ? <Alert tone="success">Invite created — it is at the top of the list below.</Alert> : null}

      <input type="hidden" name="grant" value="HOUSEHOLD_MEMBER" />

      <Field
        label="Who is this for?"
        name="forName"
        required={false}
        placeholder="Mira, Grandma, Uncle Ben…"
        error={state?.fieldErrors?.forName}
        hint="Optional — it just labels the code in the list below, so you can remember who you gave it to."
      />

      <SelectField
        label="What will they do here?"
        name="intendedRole"
        defaultValue="MEMBER"
        options={[
          { value: "MEMBER", label: "Play — make and play their own adventurers" },
          { value: "PARENT", label: "Help run the household — also invites and fixes sheets" },
        ]}
        hint="A child's code is the first one, and it is the only one that can be redeemed with a username instead of an email address. The second is for another grown-up in the house."
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
