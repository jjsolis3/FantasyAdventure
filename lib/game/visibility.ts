/**
 * Who you can see, in one place.
 *
 * Until now this question had two different answers in two different modules
 * and neither of them was right. `invitableCharacters` asked for
 * `{ userId: { not: userId } }` — **every character in the database**, with the
 * display name of the adult who plays them, offered in a dropdown. And
 * `reachableCharacterWhere` asked a narrower question, scoped to your own table,
 * so ties and party invitations disagreed about who existed. Two rules for one
 * question is how they drift; this is the one rule.
 *
 * ## What it says
 *
 * You see your own household's adventurers, the adventurers of any household
 * yours has agreed to play with, and **anybody you are actually travelling
 * with** — that last branch regardless of households.
 *
 * ## Why the third branch matters more than it looks
 *
 * It is what makes "unlinking does not break an adventure already under way"
 * nearly free. Campaign membership flows entirely through `PartyMember` via
 * `memberCampaignWhere`, which never mentions households at all. Delete the
 * link and the first branch stops matching: the two families vanish from each
 * other's pickers and no new sharing is possible. But everybody already in a
 * party keeps the story, and keeps each other.
 *
 * That is a deliberate answer to a real question — what happens to a Saturday
 * evening that is half-played when somebody falls out. The adventure finishes.
 * Nothing a child is in the middle of disappears because two adults stopped
 * agreeing.
 */

import type { Prisma } from "@/generated/prisma/client.ts";
import { memberCampaignWhere } from "@/lib/game/access";

/** Enough of a client to read links. Accepts `db` or a transaction. */
type LinkClient = { householdLink: Prisma.TransactionClient["householdLink"] };

/**
 * The pair, sorted, so two households are one row whichever of them redeemed.
 *
 * Without this the unique constraint is decorative — (A,B) and (B,A) would both
 * insert, and every read would have to look in two directions forever. Same
 * idiom as `canonicalPair` for ties, one level up.
 */
export function canonicalLink(
  first: string,
  second: string,
): { householdAId: string; householdBId: string } {
  return first < second
    ? { householdAId: first, householdBId: second }
    : { householdAId: second, householdBId: first };
}

/**
 * The households this one may see into: itself, and everyone it is linked to.
 *
 * Returns an empty list for an account belonging to no household, rather than
 * throwing — and an empty list matched against `{ in: [] }` is what Prisma
 * treats as *nothing*, which is the safe direction. A stray account sees no
 * adventurers rather than all of them.
 */
export async function visibleHouseholdIds(
  db: LinkClient,
  householdId: string | null | undefined,
): Promise<string[]> {
  if (!householdId) return [];

  const links = await db.householdLink.findMany({
    where: { OR: [{ householdAId: householdId }, { householdBId: householdId }] },
    select: { householdAId: true, householdBId: true },
  });

  const ids = new Set<string>([householdId]);
  for (const link of links) {
    ids.add(link.householdAId === householdId ? link.householdBId : link.householdAId);
  }
  return [...ids];
}

/**
 * Adventurers this person may see.
 *
 * `householdIds` comes from `visibleHouseholdIds` and is the *whole* of the
 * household half of the rule — passed in rather than looked up here so this
 * stays a pure `where` clause that can be spread into any query, and so a
 * screen that needs it twice pays for the lookup once.
 */
export function visibleCharacterWhere(
  userId: string,
  householdIds: string[],
): Prisma.CharacterWhereInput {
  return {
    OR: [
      { householdId: { in: householdIds } },
      // Anybody actually travelled with stays visible, link or no link.
      { partyMemberships: { some: { campaign: memberCampaignWhere(userId) } } },
    ],
  };
}

/**
 * Whether two households have agreed to play together.
 *
 * The same question `visibleCharacterWhere` asks, for the places that need a
 * yes or no rather than a filter — joining an adventure by code, most of all.
 */
export function areLinked(householdIds: string[], other: string | null | undefined): boolean {
  return other !== null && other !== undefined && householdIds.includes(other);
}
