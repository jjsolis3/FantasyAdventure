/**
 * Who you may say you are related to, and who has to agree.
 *
 * Two rules live here, and they exist for opposite reasons — one because the
 * old rule was too tight, one because it was too loose.
 *
 * **Reach.** A tie used to be declarable only with somebody the *declaring
 * character* had already shared a campaign with. That is a chicken-and-egg: a
 * brand-new adventurer has shared nothing, so the dropdown came back empty and
 * the sheet said "add another adventurer first" — with no way to add one,
 * because the adventurers were somebody else's. The case that found it: a
 * father handed his old character to his daughters, made a new one, and could
 * not say he was their father. The tie is not cosmetic — `deepen` in
 * `lib/engine/play.ts` only ever raises the bond on ties the family declared,
 * so every bonding moment they earned together that evening counted for
 * nothing.
 *
 * So reach is now scoped to the *table* rather than to one character: your own
 * adventurers, and anybody in an adventure you own or are travelling in. Not
 * one step wider — this must never become a way to browse the whole app.
 *
 * **Consent.** The other half. One-sided declaration was fine while every
 * character in the house belonged to one account; it stops being fine the
 * moment somebody outside the house joins a party, because "your child is my
 * character's sister" is a claim about somebody else's character and it earns
 * real things — bond levels, Family Moves. So a tie that touches only accounts
 * you already speak for is confirmed on the spot, and one that touches another
 * household waits for their yes.
 *
 * Waiting costs nothing and breaks nothing: an unconfirmed tie is stored, shown
 * on both sheets, and simply earns no bond and is not mentioned to the
 * storyteller until somebody says yes.
 */

import type { Prisma } from "@/generated/prisma/client.ts";

/**
 * Who a tie may reach is no longer decided here.
 *
 * `reachableCharacterWhere` used to live in this module and answer a slightly
 * different question from the one the party picker asked — your own table for
 * ties, the entire database for invitations. Two rules for one question, and
 * they drifted exactly as far apart as you would expect. Both are now
 * `visibleCharacterWhere` in `lib/game/visibility.ts`.
 *
 * What stays here is consent: whether a claim about somebody's character needs
 * that household's yes.
 */

/** A stored tie, as much of it as the rules below need. */
export type TieRow = {
  confirmedAt: Date | null;
};

/**
 * Whether this tie counts yet.
 *
 * Everything that pays out asks this: bond experience, Family Moves, and what
 * the storyteller is told about who is family. A proposal is a proposal until
 * the other household agrees.
 *
 * Rows written before ties needed confirming are confirmed by the migration, so
 * a null here always means "asked, not yet answered" and never "old".
 */
export function isConfirmed(tie: TieRow): boolean {
  return tie.confirmedAt !== null;
}

/** Narrows a relationship query to ties that actually count. */
export const CONFIRMED_TIES: Prisma.RelationshipWhereInput = { confirmedAt: { not: null } };

/**
 * Whether declaring this tie needs somebody else to agree.
 *
 * The question is about **households**, not accounts — and that is a gift
 * rather than a restriction. It used to compare account ids, which meant that
 * on this very installation, where a father and his two daughters each have
 * their own sign-in, saying "Mira is Bramble's sister" needed a nine-year-old
 * to go and confirm her own family's paperwork before the tie earned a single
 * bond point. One family talking to itself, made to hold a ceremony.
 *
 * A household is the honest unit: inside one, a tie is confirmed on the spot.
 * Reaching into another — a friend's family, now that there can be one — is a
 * claim about somebody else's child and waits for their yes.
 *
 * Two nulls do **not** match. An account outside every household is not an
 * ordinary state, and the safe answer to "may this nobody speak for that
 * nobody" is no.
 */
export function needsConsent(
  fromHouseholdId: string | null | undefined,
  toHouseholdId: string | null | undefined,
): boolean {
  if (!fromHouseholdId || !toHouseholdId) return true;
  return fromHouseholdId !== toHouseholdId;
}

/**
 * Who still has to say yes, from the point of view of somebody reading a sheet.
 *
 * Returns null when there is nothing to wait for. The name rather than the id,
 * because this ends up in a sentence a child reads.
 */
export function pendingFor(
  tie: TieRow & { proposedById: string | null },
  viewerId: string,
): "you" | "them" | null {
  if (isConfirmed(tie)) return null;
  // The household that asked is not the one being asked.
  return tie.proposedById === viewerId ? "them" : "you";
}
