"use server";

/**
 * Actually closing a household.
 *
 * Separated from the rule in `close-household.ts` for the usual reason, and one
 * extra: this file is the only place in the application that deletes a person's
 * account, and it should be short enough to read in one go.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { destroySession, requireHouseholdParent } from "@/lib/auth/session";
import { mayCloseHousehold } from "@/lib/game/close-household";

export type CloseFormState = { error: string } | null;

export async function closeHouseholdAction(
  _prev: CloseFormState,
  formData: FormData,
): Promise<CloseFormState> {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) return { error: "This account is not part of a household." };

  const household = await db.household.findUnique({
    where: { id: actor.householdId },
    select: { id: true, name: true },
  });
  if (!household) return { error: "That household is already gone." };

  const verdict = mayCloseHousehold({
    actor: { householdRole: actor.user.householdRole, everywhere: actor.everywhere },
    householdName: household.name,
    typed: String(formData.get("confirm") ?? ""),
  });
  if (!verdict.ok) return { error: verdict.reason };

  // Who is in it, read *before* the household goes — afterwards the membership
  // rows have cascaded and there is no way left to find these accounts.
  const members = await db.householdMember.findMany({
    where: { householdId: household.id },
    select: { userId: true },
  });

  await db.$transaction(async (tx) => {
    // The household first. Everything a household owns hangs off it with a
    // cascade — adventurers, adventures and every scene and turn inside them,
    // invitations, links, the subscription — so this one statement is most of
    // the work. Adventures this family *wrote* go the same way unless they were
    // shared, which sets their household to null instead and leaves them
    // readable for the families part-way through one.
    await tx.household.delete({ where: { id: household.id } });

    // Then the people. Not covered by the cascade above, because an account is
    // not owned by a household — it belongs to a person, and the schema has
    // always allowed one to move house. Closing a family is the one time the
    // accounts go with it, which is what the screen says it does.
    if (members.length > 0) {
      await tx.user.deleteMany({ where: { id: { in: members.map((m) => m.userId) } } });
    }
  });

  // The actor's own account is one of the ones just deleted, so the cookie now
  // points at a session that cannot resolve. Clearing it explicitly means they
  // land on the front page rather than on a redirect loop.
  await destroySession();
  redirect("/?closed=1");
}
