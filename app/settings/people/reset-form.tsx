"use client";

import { useActionState, useState } from "react";
import {
  renameOwnHouseholdAction,
  setMemberPasswordAction,
  setMemberRoleAction,
  setMemberSignInAction,
  type PeopleFormState,
} from "@/lib/game/people-actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type Person = {
  id: string;
  displayName: string;
  signIn: string;
  isUsername: boolean;
  householdRole: string;
  roleLabel: string;
  mayReset: boolean;
  maySetRole: boolean;
  mayUseUsername: boolean;
  isYou: boolean;
};

const selectClass =
  "w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none";

/** Renaming the family. Separate form, separate state, so one error is not two. */
export function RenameHousehold({ name }: { name: string }) {
  const [state, formAction] = useActionState<PeopleFormState, FormData>(renameOwnHouseholdAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.done ? <Alert tone="success">{state.done}</Alert> : null}

      <Field
        label="What is this family called?"
        name="name"
        defaultValue={name}
        placeholder="The Solis family"
        hint="Households were named after whoever registered first, which is a guess. This is the answer."
      />
      <SubmitButton pendingLabel="Saving…">Save the name</SubmitButton>
    </form>
  );
}

/**
 * The family, and the three things a household's grown-ups may do to it.
 *
 * One person is chosen at a time and the controls appear beneath them, because
 * these are things you do rarely and a row of password boxes beside every
 * child's name reads as an invitation to change something.
 */
export function PeopleList({ people }: { people: Person[] }) {
  const [password, passwordAction] = useActionState<PeopleFormState, FormData>(
    setMemberPasswordAction,
    null,
  );
  const [role, roleAction] = useActionState<PeopleFormState, FormData>(setMemberRoleAction, null);
  const [signIn, signInAction] = useActionState<PeopleFormState, FormData>(
    setMemberSignInAction,
    null,
  );

  const [open, setOpen] = useState<{ id: string; what: "password" | "role" | "signIn" } | null>(null);
  const chosen = people.find((person) => person.id === open?.id) ?? null;
  const [kind, setKind] = useState<"email" | "username">("email");

  const state = open?.what === "role" ? role : open?.what === "signIn" ? signIn : password;

  function toggle(id: string, what: "password" | "role" | "signIn") {
    setOpen((current) => (current?.id === id && current.what === what ? null : { id, what }));
  }

  return (
    <div className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.done ? <Alert tone="success">{state.done}</Alert> : null}

      <ul className="divide-y divide-hearth-800/50">
        {people.map((person) => (
          <li key={person.id} className="py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-hearth-100">{person.displayName}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-hearth-400">
                {person.signIn}
                {person.isUsername ? <span className="text-hearth-500"> (username)</span> : null}
                {" · "}
                {person.roleLabel}
                {person.isYou ? " · you" : ""}
              </span>
            </div>

            {person.mayReset || person.maySetRole ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {person.mayReset ? (
                  <button
                    type="button"
                    onClick={() => toggle(person.id, "password")}
                    className="rounded-lg border border-hearth-800/70 px-3 py-1.5 text-sm text-hearth-200 transition-colors hover:border-hearth-600"
                  >
                    {open?.id === person.id && open.what === "password"
                      ? "Never mind"
                      : "They forgot their password"}
                  </button>
                ) : null}

                {person.mayReset ? (
                  <button
                    type="button"
                    onClick={() => {
                      setKind(person.mayUseUsername ? (person.isUsername ? "username" : "email") : "email");
                      toggle(person.id, "signIn");
                    }}
                    className="rounded-lg border border-hearth-800/70 px-3 py-1.5 text-sm text-hearth-200 transition-colors hover:border-hearth-600"
                  >
                    {open?.id === person.id && open.what === "signIn"
                      ? "Never mind"
                      : "Change how they sign in"}
                  </button>
                ) : null}

                {person.maySetRole ? (
                  <button
                    type="button"
                    onClick={() => toggle(person.id, "role")}
                    className="rounded-lg border border-hearth-800/70 px-3 py-1.5 text-sm text-hearth-200 transition-colors hover:border-hearth-600"
                  >
                    {open?.id === person.id && open.what === "role"
                      ? "Never mind"
                      : "Change what they may do"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {chosen && open?.what === "password" ? (
        <form action={passwordAction} className="space-y-4 rounded-lg border border-hearth-800/70 p-4">
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
          <Field label="Type it again" name="confirmPassword" type="password" autoComplete="new-password" />
          <SubmitButton pendingLabel="Setting…">Set their password</SubmitButton>
        </form>
      ) : null}

      {chosen && open?.what === "signIn" ? (
        <form action={signInAction} className="space-y-4 rounded-lg border border-hearth-800/70 p-4">
          <input type="hidden" name="userId" value={chosen.id} />
          <p className="text-sm text-hearth-200/80">
            How <span className="text-hearth-100">{chosen.displayName}</span> signs in. Changing the
            kind replaces the old one — an account has one or the other, never both.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-hearth-200">With what?</span>
            <select
              name="handleKind"
              value={kind}
              onChange={(event) => setKind(event.target.value === "username" ? "username" : "email")}
              className={selectClass}
              disabled={!chosen.mayUseUsername}
            >
              <option value="email" className="bg-hearth-950">
                An email address
              </option>
              {chosen.mayUseUsername ? (
                <option value="username" className="bg-hearth-950">
                  A username
                </option>
              ) : null}
            </select>
            {!chosen.mayUseUsername ? (
              <span className="mt-1.5 block text-sm text-hearth-400">
                {chosen.displayName} helps run the family, and a grown-up&rsquo;s account is reached by
                email — that is how a password reset finds them.
              </span>
            ) : null}
            {/* The select is disabled when there is no choice, and a disabled
                select posts nothing — so the value travels in its own field. */}
            {!chosen.mayUseUsername ? <input type="hidden" name="handleKind" value="email" /> : null}
          </label>

          <Field
            label={kind === "email" ? "Email" : "Username"}
            name="handle"
            defaultValue={chosen.signIn}
            autoComplete="off"
          />
          <SubmitButton pendingLabel="Saving…">Save how they sign in</SubmitButton>
        </form>
      ) : null}

      {chosen && open?.what === "role" ? (
        <form action={roleAction} className="space-y-4 rounded-lg border border-hearth-800/70 p-4">
          <input type="hidden" name="userId" value={chosen.id} />
          <p className="text-sm text-hearth-200/80">
            What <span className="text-hearth-100">{chosen.displayName}</span> may do in this family.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-hearth-200">Their job</span>
            <select name="role" defaultValue={chosen.householdRole} className={selectClass}>
              <option value="MEMBER" className="bg-hearth-950">
                Play — make and play their own adventurers
              </option>
              <option value="PARENT" className="bg-hearth-950">
                Help run the family — invites, sheets, passwords
              </option>
            </select>
            <span className="mt-1.5 block text-sm text-hearth-400">
              Somebody who helps run the family is reached by email, so they need an address before
              they can be given the job.
            </span>
          </label>
          <SubmitButton pendingLabel="Saving…">Save their job</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
