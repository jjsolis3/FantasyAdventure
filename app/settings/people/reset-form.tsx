"use client";

import { useActionState, useState } from "react";
import { setMemberPasswordAction, type PeopleFormState } from "@/lib/game/people-actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type Person = {
  id: string;
  displayName: string;
  signIn: string;
  isUsername: boolean;
  roleLabel: string;
  mayReset: boolean;
  isYou: boolean;
};

/**
 * Helping somebody back into their account.
 *
 * The form is collapsed until somebody is chosen, because it is a thing you do
 * rarely and a row of password boxes beside every child's name reads as an
 * invitation to change something.
 */
export function PeopleList({ people }: { people: Person[] }) {
  const [state, formAction] = useActionState<PeopleFormState, FormData>(setMemberPasswordAction, null);
  const [helping, setHelping] = useState<string | null>(null);
  const chosen = people.find((person) => person.id === helping) ?? null;

  return (
    <div className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.done ? <Alert tone="success">{state.done}</Alert> : null}

      <ul className="divide-y divide-hearth-800/50">
        {people.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-hearth-100">{person.displayName}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-hearth-400">
              {person.signIn}
              {person.isUsername ? <span className="text-hearth-500"> (username)</span> : null}
              {" · "}
              {person.roleLabel}
              {person.isYou ? " · you" : ""}
            </span>

            {person.mayReset ? (
              <button
                type="button"
                onClick={() => setHelping(person.id === helping ? null : person.id)}
                className="rounded-lg border border-hearth-800/70 px-3 py-1.5 text-sm text-hearth-200 transition-colors hover:border-hearth-600"
              >
                {person.id === helping ? "Never mind" : "They forgot their password"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {chosen ? (
        <form action={formAction} className="space-y-4 rounded-lg border border-hearth-800/70 p-4">
          <input type="hidden" name="userId" value={chosen.id} />
          <p className="text-sm text-hearth-200/80">
            Choose a new password for <span className="text-hearth-100">{chosen.displayName}</span> and
            tell it to them. Every device they are signed in on will be signed out.
          </p>
          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters. Something you can both remember and say out loud."
          />
          <Field
            label="Type it again"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
          />
          <SubmitButton pendingLabel="Setting…">Set their password</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
