"use client";

import { useActionState, useState } from "react";
import { createInviteAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field, SelectField } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Writing an invitation, and saying what it grants.
 *
 * The grant picker only appears for whoever runs Hearthlight, because a parent
 * has exactly one legal option and a menu with one item on it is not a choice,
 * it is a thing to wonder about. Hiding it is a courtesy, not a defence:
 * `createInviteAction` refuses a `NEW_HOUSEHOLD` grant from anybody else
 * whether or not this form offered it.
 */
export function InviteForm({ mayAdmitFamilies }: { mayAdmitFamilies: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(createInviteAction, null);
  const [grant, setGrant] = useState("HOUSEHOLD_MEMBER");
  const created = state !== null && state.error === "";
  const newHousehold = mayAdmitFamilies && grant === "NEW_HOUSEHOLD";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {created ? <Alert tone="success">Invite created — it is at the top of the list below.</Alert> : null}

      {mayAdmitFamilies ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">What does this code do?</span>
          <select
            name="grant"
            value={grant}
            onChange={(event) => setGrant(event.target.value)}
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          >
            <option value="HOUSEHOLD_MEMBER" className="bg-hearth-950">
              Joins your household
            </option>
            <option value="NEW_HOUSEHOLD" className="bg-hearth-950">
              Starts a household of their own
            </option>
          </select>
          <span className="mt-1.5 block text-sm text-hearth-400">
            {newHousehold
              ? "They become the head of a new family and can invite their own children. They will not see your adventurers, and you will not see theirs, until the two households are linked."
              : "They join your family and can see the adventurers in it."}
          </span>
        </label>
      ) : (
        <input type="hidden" name="grant" value="HOUSEHOLD_MEMBER" />
      )}

      <Field
        label="Who is this for?"
        name="forName"
        required={false}
        placeholder="Mira, Grandma, Uncle Ben…"
        error={state?.fieldErrors?.forName}
        hint="Optional — it just labels the code in the list below, so you can remember who you gave it to."
      />

      {newHousehold ? null : (
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
      )}

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
