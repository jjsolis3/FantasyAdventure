"use server";

/**
 * Agreeing to adventure with another family, and stopping.
 *
 * The friend's family is the whole reason any of this exists. Two households
 * that have never met should see nothing of each other — not each other's
 * adventurers, not their names, not that they exist. And two households that
 * *have* agreed should see each other's adventurers in the party picker, so a
 * joint adventure is a thing you set up rather than a thing you negotiate.
 *
 * **The agreement is two actions, not a request and an approval.** One
 * household shares its `linkCode`; the other types it in. Sharing is one
 * consent and redeeming is the other, and neither needs a pending state, an
 * inbox, or a notification — the code travels by whatever means two parents
 * already talk to each other.
 *
 * **Only a household's owner or parent may share or redeem.** A nine-year-old
 * should not be able to attach her family to strangers because somebody in a
 * game chat sent her a code that looked interesting.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { generateHouseholdLinkCode, normaliseInviteCode } from "@/lib/auth/invite-code";
import { canonicalLink } from "@/lib/game/visibility";

export type LinkFormState = { error: string; done?: string } | null;

/**
 * Accepts another household's code, and links the two.
 *
 * Every refusal below is about the code rather than about the household behind
 * it: "that code does not match any family" is the same sentence whether the
 * code was mistyped or belongs to somebody who has since rotated it. A code
 * picker should not be able to learn which guesses were close.
 */
export async function redeemLinkCodeAction(
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) {
    return { error: "This account is not part of a household yet. Ask an administrator." };
  }

  const code = normaliseInviteCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter the code the other family gave you." };

  const other = await db.household.findUnique({
    where: { linkCode: code },
    select: { id: true, name: true },
  });
  if (!other) {
    return { error: "That code does not match any family. Check it and try again." };
  }
  if (other.id === actor.householdId) {
    return { error: "That is your own family's code — you already adventure together." };
  }

  const pair = canonicalLink(actor.householdId, other.id);

  const already = await db.householdLink.findUnique({
    where: { householdAId_householdBId: pair },
    select: { id: true },
  });
  if (already) {
    return { error: `You already adventure with ${other.name}.` };
  }

  await db.householdLink.create({ data: { ...pair, createdById: actor.user.id } });

  // Both the picker on the setup screen and the tie dropdown read this, so the
  // adventurers appear without anybody reloading anything by hand.
  revalidatePath("/settings/families");
  revalidatePath("/campaigns/new");
  revalidatePath("/characters");

  return { error: "", done: `You and ${other.name} can adventure together now.` };
}

/**
 * Cuts the link, from either side, without asking.
 *
 * A family that wants out of an arrangement should not need the other family's
 * cooperation to get out of it — the same reasoning as withdrawing a tie.
 *
 * **What this does not do is end an adventure.** Both families vanish from each
 * other's pickers immediately and no new sharing is possible, but anybody
 * already travelling together keeps the story and keeps each other: the party
 * branch of `visibleCharacterWhere` never mentions households. A half-played
 * Saturday does not disappear because two adults stopped agreeing.
 */
export async function unlinkHouseholdAction(formData: FormData): Promise<void> {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) return;

  const other = String(formData.get("householdId") ?? "");
  if (!other) return;

  // Scoped to a pair this household is actually in, so the id from the form
  // cannot be used to cut a link between two families the caller is not part
  // of. `deleteMany` rather than `delete` so a stale form is a no-op rather
  // than an error page.
  await db.householdLink.deleteMany({
    where: canonicalLink(actor.householdId, other),
  });

  revalidatePath("/settings/families");
  revalidatePath("/campaigns/new");
  revalidatePath("/characters");
}

/**
 * Issues the household a new code, and invalidates the old one.
 *
 * Existing links are untouched — they are rows, not derived from the code. This
 * is for "I put it in a group chat and now I'd rather I hadn't", which needs to
 * be undoable without unpicking the families who already used it.
 */
export async function rotateLinkCodeAction(formData: FormData): Promise<void> {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) return;

  // The form carries nothing that decides anything — the household comes off
  // the session — but reading it keeps the signature honest for a server action
  // bound to a form.
  void formData;

  await db.household.update({
    where: { id: actor.householdId },
    data: { linkCode: generateHouseholdLinkCode() },
  });

  revalidatePath("/settings/families");
}

/** This household, its code, and the families it plays with. */
export async function familiesOverview() {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) return null;

  const [household, links] = await Promise.all([
    db.household.findUnique({
      where: { id: actor.householdId },
      select: { id: true, name: true, linkCode: true },
    }),
    db.householdLink.findMany({
      where: {
        OR: [{ householdAId: actor.householdId }, { householdBId: actor.householdId }],
      },
      select: {
        id: true,
        createdAt: true,
        householdA: { select: { id: true, name: true } },
        householdB: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!household) return null;

  return {
    household,
    // Flattened to "the other one", because which side of the pair a family
    // landed on is an artefact of sorting ids and means nothing to a reader.
    others: links.map((link) => ({
      linkId: link.id,
      since: link.createdAt,
      other: link.householdA.id === household.id ? link.householdB : link.householdA,
    })),
  };
}
