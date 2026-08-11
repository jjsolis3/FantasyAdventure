"use server";

import { revalidatePath } from "next/cache";
import { db, isUniqueViolation } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

/**
 * Asking, cancelling, accepting, declining.
 *
 * An invitation only ever becomes a place in the party through `respondToInvite`
 * below, and only the account that holds the adventurer can call it. That is the
 * whole point of the feature: the person who starts the adventure chooses who to
 * ask, and the person being asked chooses whether to go.
 */

/** Adds somebody else's adventurer to the list of people being asked. Owner only. */
export async function inviteCharacterAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const campaignId = String(formData.get("campaignId") ?? "");
  const characterId = String(formData.get("characterId") ?? "");
  if (!campaignId || !characterId) return;

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ownerId: user.id },
    include: {
      storyline: { select: { maxPlayers: true } },
      party: { select: { characterId: true } },
      invites: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  if (!campaign || campaign.status === "COMPLETE") return;

  // Your own adventurers are added directly; there is nobody to ask.
  const character = await db.character.findFirst({
    where: { id: characterId, userId: { not: user.id } },
    select: { id: true },
  });
  if (!character) return;

  if (campaign.party.some((member) => member.characterId === characterId)) return;
  if (campaign.party.length + campaign.invites.length >= campaign.storyline.maxPlayers) return;

  try {
    await db.partyInvite.upsert({
      where: { campaignId_characterId: { campaignId, characterId } },
      create: { campaignId, characterId, invitedById: user.id },
      // Asking again after a no is allowed — people change their minds, and a
      // declined invitation that could never be re-sent would mean deleting and
      // rebuilding the adventure.
      update: { status: "PENDING", invitedById: user.id, respondedAt: null },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

/** Takes an invitation back. Owner only, and only while it is unanswered. */
export async function cancelInviteAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return;

  const invite = await db.partyInvite.findFirst({
    where: { id: inviteId, status: "PENDING", campaign: { ownerId: user.id } },
    select: { id: true, campaignId: true },
  });
  if (!invite) return;

  await db.partyInvite.delete({ where: { id: invite.id } });

  revalidatePath(`/campaigns/${invite.campaignId}`);
  revalidatePath("/campaigns");
}

/**
 * Saying yes or no. Only the account that holds the adventurer can.
 *
 * Yes writes the party place and the answer together, so there is never a
 * moment where an invitation reads as accepted but nobody is in the party.
 * The position is taken at the end of the turn order, which is also where the
 * join code puts people.
 */
export async function respondToInviteAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const inviteId = String(formData.get("inviteId") ?? "");
  const answer = String(formData.get("answer") ?? "");
  if (!inviteId || (answer !== "accept" && answer !== "decline")) return;

  const invite = await db.partyInvite.findFirst({
    where: { id: inviteId, status: "PENDING", character: { userId: user.id } },
    include: {
      campaign: {
        select: {
          id: true,
          status: true,
          storyline: { select: { maxPlayers: true } },
          party: { select: { position: true, characterId: true } },
        },
      },
    },
  });
  if (!invite) return;

  if (answer === "decline") {
    await db.partyInvite.update({
      where: { id: invite.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    revalidatePath(`/campaigns/${invite.campaignId}`);
    revalidatePath("/campaigns");
    return;
  }

  const { campaign } = invite;
  const already = campaign.party.some((member) => member.characterId === invite.characterId);

  // A finished adventure has nothing left to join, and a full one would push
  // the party past what the storyline can hold. Either way the invitation is
  // answered rather than left sitting there unanswerable.
  if (!already && (campaign.status === "COMPLETE" || campaign.party.length >= campaign.storyline.maxPlayers)) {
    await db.partyInvite.update({
      where: { id: invite.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    revalidatePath("/campaigns");
    return;
  }

  const position =
    campaign.party.reduce((highest, member) => Math.max(highest, member.position), -1) + 1;

  await db.$transaction(async (tx) => {
    if (!already) {
      await tx.partyMember.create({
        data: { campaignId: campaign.id, characterId: invite.characterId, position },
      });
    }
    await tx.partyInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath(`/campaigns/${campaign.id}/play`);
  revalidatePath("/campaigns");
}
