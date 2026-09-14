"use server";

/**
 * The people in a family, and helping one of them back in.
 *
 * A nine-year-old will forget her password, and until now that was the end of
 * the account: set at registration, changed only on a screen that asks for the
 * current one. She has no email address — that is the whole point of her having
 * a username — so there is nothing to send a reset link to even if there were
 * somewhere to send it from.
 *
 * So the grown-up sitting next to her sets a new one. Which grown-up, and for
 * whom, is `mayResetPassword` in `lib/auth/member-authority.ts`.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHouseholdParent, type HouseholdActor } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { mayActForHousehold } from "@/lib/game/households";
import {
  mayEditSignIn,
  mayResetPassword,
  maySetRole,
  mayUseUsername,
} from "@/lib/auth/member-authority";
import { normaliseHandle, signInColumns, signInProblem } from "@/lib/auth/change-sign-in";

export type PeopleFormState = { error: string; done?: string } | null;

type Membership = { householdId: string; role: string } | null;
type TargetUser = { id: string; role: string };

/** The caller, in the shape the rules in `member-authority` ask for. */
function actorFor(actor: HouseholdActor) {
  return {
    userId: actor.user.id,
    householdId: actor.householdId,
    householdRole: actor.user.householdRole,
    platformAdmin: actor.everywhere,
  };
}

/** And the person being acted on, read from the database rather than the form. */
function targetFor(user: TargetUser, membership: Membership) {
  return {
    userId: user.id,
    householdId: membership?.householdId ?? null,
    householdRole: membership?.role ?? null,
    platformAdmin: user.role === "PLATFORM_ADMIN",
  };
}

/** Everybody in this household, and what each of them may do. */
export async function householdPeople() {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) return null;

  const household = await db.household.findUnique({
    where: { id: actor.householdId },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          user: {
            select: { id: true, displayName: true, email: true, username: true, role: true },
          },
        },
      },
    },
  });
  if (!household) return null;

  return {
    household: { id: household.id, name: household.name },
    actorId: actor.user.id,
    people: household.members.map((member) => ({
      id: member.user.id,
      displayName: member.user.displayName,
      email: member.user.email,
      username: member.user.username,
      householdRole: member.role,
      platformAdmin: member.user.role === "PLATFORM_ADMIN",
      // Asked here so the screen draws only the controls that would actually
      // work. A courtesy and not the guard — every action asks again.
      mayReset: mayResetPassword(
        actorFor(actor),
        targetFor(member.user, { householdId: household.id, role: member.role }),
      ).ok,
      maySetRole: maySetRole(
        actorFor(actor),
        targetFor(member.user, { householdId: household.id, role: member.role }),
        member.role === "MEMBER" ? "PARENT" : "MEMBER",
      ).ok,
      mayUseUsername: mayUseUsername({
        householdRole: member.role,
        platformAdmin: member.user.role === "PLATFORM_ADMIN",
      }),
    })),
  };
}

/**
 * Sets a new password for somebody else in the family.
 *
 * The target is looked up **with their household membership**, so the rule is
 * decided against what the database says rather than against anything the form
 * carried. A form can name any id it likes; it cannot make that id a member of
 * the caller's household.
 */
export async function setMemberPasswordAction(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  const actor = await requireHouseholdParent();

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!userId) return { error: "Pick somebody to help." };
  if (password.length < 10) {
    return { error: "Use at least 10 characters — a short phrase is easier to remember." };
  }
  if (password !== confirm) return { error: "Those two passwords do not match." };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      role: true,
      households: { take: 1, orderBy: { createdAt: "asc" }, select: { householdId: true, role: true } },
    },
  });
  // Not found rather than forbidden, for an id that does not exist: a different
  // answer would say whether it does.
  if (!target) return { error: "That account no longer exists." };

  const membership = target.households[0] ?? null;
  const verdict = mayResetPassword(actorFor(actor), targetFor(target, membership));
  if (!verdict.ok) return { error: verdict.reason };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        passwordHash: await hashPassword(password),
        // A forgotten password and a locked-out account arrive together more
        // often than not — the child tried eight times before asking for help.
        // Leaving the lock in place would mean the new password did not work
        // either, for fifteen minutes, with no explanation she could act on.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Every session that account had ends. Somebody who has just been handed a
    // new password should be the only one holding the account, and if the
    // reason for the reset was that a sibling knew the old one, a still-live
    // session on the sibling's tablet would defeat the whole exercise.
    await tx.authSession.deleteMany({ where: { userId: target.id } });
  });

  revalidatePath("/settings/people");
  return { error: "", done: `${target.displayName} can sign in with the new password now.` };
}

const ROLE_WORDS: Record<string, string> = {
  PARENT: "helping run the family",
  MEMBER: "playing",
};

/**
 * Changes what somebody in this family may do.
 *
 * The owner's job, not the operator's. It used to be the operator's, which only
 * looked wrong once the two lived on different accounts: promoting your own
 * spouse meant signing out and in as whoever runs the server.
 *
 * Demoting the last grown-up is refused, because a household with nobody able
 * to act for it cannot invite, cannot reset a password and cannot put a sheet
 * right — and the person who could undo it is the one who just gave the power
 * away.
 */
export async function setMemberRoleAction(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  const actor = await requireHouseholdParent();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId) return { error: "Pick somebody." };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      role: true,
      username: true,
      households: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, householdId: true, role: true } },
    },
  });
  if (!target) return { error: "That account no longer exists." };

  const membership = target.households[0] ?? null;
  const verdict = maySetRole(actorFor(actor), targetFor(target, membership), role);
  if (!verdict.ok) return { error: verdict.reason };
  if (!membership) return { error: "That person is not in a household." };
  if (membership.role === role) return { error: "", done: "Nothing to change." };

  // A username is a child's account and only a child's, so promoting somebody
  // who signs in with one would leave a grown-up of the household with no
  // address — unreachable by the reset flow that exists precisely for them.
  // Refused with the fix named, rather than half-applied.
  if (role === "PARENT" && target.username) {
    return {
      error: `${target.displayName} signs in with a username. Give them an email address first — whoever helps run a family is reached by email.`,
    };
  }

  if (role === "MEMBER" && mayActForHousehold(membership.role)) {
    const others = await db.householdMember.count({
      where: {
        householdId: membership.householdId,
        id: { not: membership.id },
        role: { in: ["OWNER", "PARENT"] },
      },
    });
    if (others === 0) {
      return {
        error: `${target.displayName} is the only one who can answer for this family. Give somebody else that job first.`,
      };
    }
  }

  // Narrowed by `maySetRole`, which is the only thing that lets this through —
  // it accepts PARENT and MEMBER and nothing else.
  await db.householdMember.update({
    where: { id: membership.id },
    data: { role: role as "PARENT" | "MEMBER" },
  });
  revalidatePath("/settings/people");
  return { error: "", done: `${target.displayName} is now ${ROLE_WORDS[role]}.` };
}

/**
 * Changes the address or username somebody in this family signs in with.
 *
 * A child who wants a different username — or who has finally got an address of
 * her own — should not have to be old enough to manage it herself.
 *
 * No password is asked for, unlike changing your *own*: the grown-up doing this
 * has already been checked against the same rule that lets them reset the
 * password outright, so a second factor here would be ceremony.
 */
export async function setMemberSignInAction(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  const actor = await requireHouseholdParent();

  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("handleKind") ?? "email") === "username" ? "username" : "email";
  const handle = normaliseHandle(String(formData.get("handle") ?? ""));
  if (!userId) return { error: "Pick somebody." };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      role: true,
      households: { take: 1, orderBy: { createdAt: "asc" }, select: { householdId: true, role: true } },
    },
  });
  if (!target) return { error: "That account no longer exists." };

  const membership = target.households[0] ?? null;
  const verdict = mayEditSignIn(actorFor(actor), targetFor(target, membership));
  if (!verdict.ok) return { error: verdict.reason };

  const problem = await signInProblem(handle, kind, {
    userId: target.id,
    displayName: target.displayName,
    householdRole: membership?.role ?? null,
    platformAdmin: target.role === "PLATFORM_ADMIN",
  });
  if (problem) return { error: problem };

  await db.user.update({ where: { id: target.id }, data: signInColumns(handle, kind) });

  revalidatePath("/settings/people");
  return { error: "", done: `${target.displayName} signs in as ${handle} now.` };
}

/**
 * Renames this family.
 *
 * "Dad's household" is what the migration guessed when households arrived,
 * because three accounts that are one family look exactly like three families
 * to a `SELECT`. "The Solis family" is the truth, and the family is who knows
 * it — so this belongs to them rather than to whoever runs the server.
 *
 * The household comes off the session and is never read from the form. The
 * platform-admin version of this, on `/admin/households`, takes an id because
 * it renames *other* people's families; this one cannot, and so has nothing to
 * check.
 */
export async function renameOwnHouseholdAction(
  _prev: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) return { error: "This account is not part of a family yet." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A family needs a name." };
  if (name.length > 80) return { error: "That name is a bit long." };

  await db.household.update({ where: { id: actor.householdId }, data: { name } });

  revalidatePath("/settings/people");
  revalidatePath("/settings");
  return { error: "", done: `Your family is called ${name} now.` };
}
