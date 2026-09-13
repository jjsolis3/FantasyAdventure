/**
 * Households: making one, and finding the one somebody is in.
 *
 * The boundary everything private is drawn around. See the `Household` model in
 * `prisma/schema.prisma` for why it is a table rather than a word in comments,
 * and why the id is written onto the rows a household owns rather than reached
 * by joining through the account that made them.
 *
 * This module deliberately takes its database client as an argument rather than
 * importing one, in the shape `knownPeople` uses in `lib/game/acquaintances.ts`.
 * Creating a household happens inside the registration transaction, and a
 * function that can only talk to the global client cannot be called from
 * inside a `$transaction` — nor unit-tested without a database.
 */

import type { Prisma } from "@/generated/prisma/client.ts";
import { isUniqueViolation } from "@/lib/db";
import { generateHouseholdLinkCode } from "@/lib/auth/invite-code";

/** Enough of a client to make a household. Accepts `db` or a transaction. */
type HouseholdClient = {
  household: Prisma.TransactionClient["household"];
  householdMember: Prisma.TransactionClient["householdMember"];
};

/**
 * What to call a household nobody has named yet.
 *
 * "Dad's household" rather than "Household 4". Every one of these is created
 * for a real person at a real moment — registering, or being swept up by the
 * migration — and their own name is the only thing available that means
 * anything to them. Renamable afterwards.
 */
export function householdNameFor(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "A household";
  return trimmed.endsWith("s") ? `${trimmed}' household` : `${trimmed}'s household`;
}

/**
 * Makes a household and puts somebody in charge of it.
 *
 * The link code is retried on collision for the same reason `createWithJoinCode`
 * retries in `lib/game/campaign-actions.ts`: two random codes colliding is
 * remote, but the column is unique, so a collision would otherwise surface as
 * an unexplained failure in the middle of somebody registering.
 */
export async function createHousehold(
  db: HouseholdClient,
  input: { ownerId: string; name: string },
): Promise<{ id: string }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const household = await db.household.create({
        data: { name: input.name, linkCode: generateHouseholdLinkCode() },
        select: { id: true },
      });

      await db.householdMember.create({
        data: { householdId: household.id, userId: input.ownerId, role: "OWNER" },
      });

      return household;
    } catch (error) {
      if (attempt >= 4 || !isUniqueViolation(error)) throw error;
    }
  }
}

/**
 * The household this account belongs to, or null.
 *
 * Null is not an ordinary state — every account gets a household when it
 * registers, and the migration gave one to everybody who already existed — so
 * callers should treat it as a fault rather than a case to handle quietly. It
 * is typed as nullable anyway, because a lie in a type is worse than a check.
 *
 * The schema allows more than one membership per account; `singleHouseholdFor`
 * is where that stops being allowed, so lifting the restriction later is one
 * decision in one place rather than an excavation.
 */
export async function singleHouseholdFor(
  db: { householdMember: Prisma.TransactionClient["householdMember"] },
  userId: string,
): Promise<{ householdId: string; role: "OWNER" | "PARENT" | "MEMBER" } | null> {
  const membership = await db.householdMember.findFirst({
    where: { userId },
    select: { householdId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  return membership ?? null;
}

/** Whether this role may invite people and put the household's sheets right. */
export function mayActForHousehold(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "PARENT";
}

/**
 * Whether this person may act on something belonging to that household.
 *
 * Pulled out as a function rather than written inline at each call site,
 * because it is the rule that was *missing* — `resetCharacterAction` took an
 * adventurer's id from a form and never compared it to anything the caller
 * owned, so any administrator could send any adventurer in the installation
 * back to level one. A rule that exists in one place can be tested exhaustively
 * and reused; one written out three times gets it right twice.
 *
 * A platform administrator passes everywhere. Somebody has to be able to help a
 * family who cannot help themselves, and their own family is one of the ones
 * they would otherwise be locked out of.
 *
 * An actor with no household of their own passes nowhere. That is not an
 * ordinary state — registration makes one in the same transaction as the
 * account — so the honest answer to "may this nobody touch that" is no.
 */
export function mayTouch(
  actor: { householdId: string | null; everywhere: boolean },
  householdId: string | null | undefined,
): boolean {
  if (actor.everywhere) return true;
  if (!actor.householdId || !householdId) return false;
  return actor.householdId === householdId;
}
