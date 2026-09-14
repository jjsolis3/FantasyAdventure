"use client";

import { useActionState } from "react";
import {
  createHouseholdAction,
  moveAccountAction,
  renameHouseholdAction,
  setHouseholdRoleAction,
  type HouseholdFormState,
} from "@/lib/game/household-actions";
import { SubmitButton } from "@/components/submit-button";

type Account = { id: string; displayName: string; signIn: string };
type Choice = { id: string; name: string };

/** Whatever the last thing you did had to say about itself. */
function Said({ state }: { state: HouseholdFormState }) {
  if (!state) return null;
  const bad = state.error !== "";
  return (
    <p
      role="status"
      className={`mt-2 text-sm ${bad ? "text-amber-300" : "text-moss-400"}`}
    >
      {bad ? state.error : state.done}
    </p>
  );
}

/**
 * Moving one account into another household.
 *
 * Two plain selects rather than drag-and-drop or a row of buttons per member:
 * this gets used a handful of times in the life of an installation, almost
 * always in one sitting, and the thing that matters is being able to read back
 * what you are about to do before you do it.
 */
export function MoveAccount({
  accounts,
  households,
}: {
  accounts: Account[];
  households: Choice[];
}) {
  const [state, action] = useActionState<HouseholdFormState, FormData>(moveAccountAction, null);

  if (accounts.length === 0 || households.length === 0) return null;

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-hearth-300">
          Account
          <select
            name="userId"
            className="rounded-lg border border-hearth-700 bg-hearth-900/60 px-3 py-2 text-hearth-100"
            defaultValue={accounts[0]?.id}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName} — {account.signIn}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-hearth-300">
          Joins
          <select
            name="householdId"
            className="rounded-lg border border-hearth-700 bg-hearth-900/60 px-3 py-2 text-hearth-100"
            defaultValue={households[0]?.id}
          >
            {households.map((household) => (
              <option key={household.id} value={household.id}>
                {household.name}
              </option>
            ))}
          </select>
        </label>

        <SubmitButton pendingLabel="Moving…">Move them</SubmitButton>
      </div>

      <p className="text-sm text-hearth-200/60">
        Their adventurers and adventures go with them. They arrive as a member rather than in
        charge, and a household nobody is left in is tidied away.
      </p>

      <Said state={state} />
    </form>
  );
}

/** Starting a household under a name that is nobody's in particular. */
export function NewHousehold() {
  const [state, action] = useActionState<HouseholdFormState, FormData>(createHouseholdAction, null);

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-hearth-300">
          Name
          <input
            name="name"
            placeholder="The Solis family"
            maxLength={80}
            className="rounded-lg border border-hearth-700 bg-hearth-900/60 px-3 py-2 text-hearth-100"
          />
        </label>
        <SubmitButton variant="secondary" pendingLabel="Making…">
          Make a household
        </SubmitButton>
      </div>
      <Said state={state} />
    </form>
  );
}

/** Renaming one, so the migration's guess does not have to be lived with. */
export function RenameHousehold({ householdId, name }: { householdId: string; name: string }) {
  const [state, action] = useActionState<HouseholdFormState, FormData>(
    renameHouseholdAction,
    null,
  );

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input
        name="name"
        defaultValue={name}
        maxLength={80}
        aria-label={`Name of ${name}`}
        className="rounded-lg border border-hearth-700 bg-hearth-900/60 px-3 py-1.5 text-sm text-hearth-100"
      />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Rename
      </SubmitButton>
      <Said state={state} />
    </form>
  );
}

/**
 * Who answers for a household, and who only plays.
 *
 * One select per person rather than a screen of its own: this is read far more
 * often than it is changed, and the answer belongs next to the name it is about.
 * The last person who can act for a household cannot be demoted — the action
 * refuses, and says why.
 */
export function MemberRole({
  memberId,
  name,
  role,
}: {
  memberId: string;
  name: string;
  role: string;
}) {
  const [state, action] = useActionState<HouseholdFormState, FormData>(
    setHouseholdRoleAction,
    null,
  );

  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <select
        name="role"
        defaultValue={role}
        aria-label={`What ${name} may do`}
        className="rounded-md border border-hearth-700 bg-hearth-900/60 px-2 py-1 text-xs text-hearth-100"
      >
        <option value="OWNER">answers for it</option>
        <option value="PARENT">may invite and put right</option>
        <option value="MEMBER">plays</option>
      </select>
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save
      </SubmitButton>
      <Said state={state} />
    </form>
  );
}
