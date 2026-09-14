"use client";

import { useActionState, useState } from "react";
import { createInviteAction, type FormState } from "@/lib/auth/actions";
import { Alert, Field, SelectField } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type HouseholdChoice = { id: string; name: string; seats: string };

/**
 * The two invitations only whoever runs Hearthlight can write.
 *
 * Both of them were unreachable before this screen existed. Admitting a family
 * was possible but hidden on the household invitations page behind a dropdown
 * that appeared for one account in the installation — which is the wrong place
 * for it, because admitting a family is the act that costs money, and it is not
 * a thing a family does. Inviting somebody into *another* family was not
 * possible at all: the household id came off the session and there was no
 * argument it could reach.
 *
 * That second one is a support tool, and it is needed more than it sounds. A
 * family whose only grown-up has forgotten their password, or who needs a
 * second parent adding and cannot manage it between them, has to be reachable
 * by somebody — and the alternative was writing a row into the database by
 * hand, which is not a remedy, it is an outage with a workaround.
 */
export function AdminInviteForm({ households }: { households: HouseholdChoice[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(createInviteAction, null);
  const [grant, setGrant] = useState("NEW_HOUSEHOLD");
  const created = state !== null && state.error === "";
  const newHousehold = grant === "NEW_HOUSEHOLD";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {created ? (
        <Alert tone="success">Invite created — it is at the top of the list below.</Alert>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-hearth-200">
          What does this code do?
        </span>
        <select
          name="grant"
          value={grant}
          onChange={(event) => setGrant(event.target.value)}
          className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
        >
          <option value="NEW_HOUSEHOLD" className="bg-hearth-950">
            Admits a new family
          </option>
          <option value="HOUSEHOLD_MEMBER" className="bg-hearth-950">
            Joins a family that is already here
          </option>
        </select>
        <span className="mt-1.5 block text-sm text-hearth-400">
          {newHousehold
            ? "They become the head of a family of their own, with their own adventurers and their own invitations. Nobody here will see their children and they will not see anybody's, until two families agree to adventure together."
            : "For helping a family who cannot do it themselves — a second grown-up who needs adding, or a household whose only parent is locked out."}
        </span>
      </label>

      {newHousehold ? null : households.length === 0 ? (
        <Alert>There are no families to invite anybody into yet.</Alert>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">Which family?</span>
          <select
            name="targetHouseholdId"
            defaultValue={households[0]?.id}
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          >
            {households.map((household) => (
              <option key={household.id} value={household.id} className="bg-hearth-950">
                {household.name} — {household.seats}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-sm text-hearth-400">
            The code lands in that family&rsquo;s house, not yours. It counts against their plan,
            and their parents will see it on their own invitations screen.
          </span>
        </label>
      )}

      <Field
        label="Who is this for?"
        name="forName"
        required={false}
        placeholder="The Okonkwos, Mira's dad…"
        error={state?.fieldErrors?.forName}
        hint="Optional — it labels the code in the list below, so you can remember who you gave it to."
      />

      {newHousehold ? null : (
        <SelectField
          label="What will they do there?"
          name="intendedRole"
          defaultValue="PARENT"
          options={[
            { value: "PARENT", label: "Help run that household — invites and fixes sheets" },
            { value: "MEMBER", label: "Play — make and play their own adventurers" },
          ]}
          hint="A grown-up is the usual answer here, since this is the screen for helping a family who are stuck."
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
