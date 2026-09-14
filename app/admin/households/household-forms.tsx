"use client";

import { useActionState } from "react";
import {
  createHouseholdAction,
  moveAccountAction,
  renameHouseholdAction,
  setHouseholdRoleAction,
  setPlanAction,
  setPlatformRoleAction,
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

/**
 * Handing the installation to somebody, or taking it back.
 *
 * A button rather than a select, because there are two states and naming them
 * in a dropdown reads like a setting when it is a transfer. It never appears on
 * your own row: a hand-over is always performed by the account *receiving* it —
 * promote the new one, sign in as it, retire the old one from there — so that
 * the new sign-in is proven to work while the old one can still fix it.
 *
 * The action refuses the same thing whether or not this renders, and refuses
 * demoting the last administrator besides.
 */
export function PlatformRole({
  userId,
  name,
  isAdmin,
}: {
  userId: string;
  name: string;
  isAdmin: boolean;
}) {
  const [state, action] = useActionState<HouseholdFormState, FormData>(setPlatformRoleAction, null);

  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="makeAdmin" value={isAdmin ? "false" : "true"} />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        {isAdmin ? `Stop ${name} running Hearthlight` : `Let ${name} run Hearthlight`}
      </SubmitButton>
      <Said state={state} />
    </form>
  );
}

/**
 * What a family is paying for.
 *
 * Plan and state in one form and saved together, because they are two halves of
 * one answer: a family whose card failed is still on Homestead and is
 * `PAST_DUE`, and a screen that made you set those separately would have a
 * moment where they disagreed.
 *
 * This is the whole of billing's user interface until there is a checkout page,
 * and it stays afterwards as the override — comping a family, putting a friend
 * on unmetered, parking an account that is being argued about.
 */
export function HouseholdPlan({
  householdId,
  name,
  plan,
  status,
}: {
  householdId: string;
  name: string;
  plan: string;
  status: string;
}) {
  const [state, action] = useActionState<HouseholdFormState, FormData>(setPlanAction, null);

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <select
        name="plan"
        defaultValue={plan}
        aria-label={`What ${name} is paying for`}
        className="rounded-md border border-hearth-700 bg-hearth-900/60 px-2 py-1 text-xs text-hearth-100"
      >
        <option value="HEARTH">Hearth — trying it out</option>
        <option value="HOMESTEAD">Homestead — one family</option>
        <option value="KEEP">Keep — a big family</option>
        <option value="UNMETERED">Unmetered — no ceiling</option>
      </select>
      <select
        name="status"
        defaultValue={status}
        aria-label={`Where ${name}'s account stands`}
        className="rounded-md border border-hearth-700 bg-hearth-900/60 px-2 py-1 text-xs text-hearth-100"
      >
        <option value="TRIALING">trialing</option>
        <option value="ACTIVE">active</option>
        <option value="PAST_DUE">past due</option>
        <option value="CANCELED">canceled</option>
      </select>
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save plan
      </SubmitButton>
      <Said state={state} />
    </form>
  );
}
