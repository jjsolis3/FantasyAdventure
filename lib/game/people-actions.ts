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
 * whom, is `mayResetPassword` in `lib/auth/member-password.ts`.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { mayResetPassword } from "@/lib/auth/member-password";

export type PeopleFormState = { error: string; done?: string } | null;

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
      // work. It is a courtesy and not the guard — the action asks again.
      mayReset: mayResetPassword(
        {
          userId: actor.user.id,
          householdId: actor.householdId,
          householdRole: actor.user.householdRole,
          platformAdmin: actor.everywhere,
        },
        {
          userId: member.user.id,
          householdId: household.id,
          householdRole: member.role,
          platformAdmin: member.user.role === "PLATFORM_ADMIN",
        },
      ).ok,
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
  const verdict = mayResetPassword(
    {
      userId: actor.user.id,
      householdId: actor.householdId,
      householdRole: actor.user.householdRole,
      platformAdmin: actor.everywhere,
    },
    {
      userId: target.id,
      householdId: membership?.householdId ?? null,
      householdRole: membership?.role ?? null,
      platformAdmin: target.role === "PLATFORM_ADMIN",
    },
  );
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
