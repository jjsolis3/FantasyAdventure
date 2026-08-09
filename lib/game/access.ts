/**
 * Who may open somebody else's adventure.
 *
 * Until now an adventure belonged to exactly one account, because the whole
 * family sat at one screen. Playing from separate devices means separate
 * sign-ins, and the party is the only honest definition of who is at the table:
 * if one of your adventurers is travelling in it, it is your adventure too.
 *
 * Reading is shared. Ending it, deleting it and changing the party stay with
 * the household that started it — see `isOwner`.
 */

import type { Prisma } from "@/generated/prisma/client.ts";
import { db } from "@/lib/db";

/** Matches adventures this account owns, or has an adventurer travelling in. */
export function memberCampaignWhere(userId: string): Prisma.CampaignWhereInput {
  return {
    OR: [{ ownerId: userId }, { party: { some: { character: { userId } } } }],
  };
}

/** Narrows a lookup by id to one this account is allowed to see. */
export function memberCampaignFilter(campaignId: string, userId: string): Prisma.CampaignWhereInput {
  return { id: campaignId, ...memberCampaignWhere(userId) };
}

export type Membership = {
  isMember: boolean;
  isOwner: boolean;
  /** Ids of the party's adventurers this account may answer for. */
  controlledCharacterIds: string[];
};

/**
 * What this account may do in this adventure.
 *
 * The owner may answer for anybody: on a shared screen one person types for
 * the whole table, and a five-year-old with no account of their own still needs
 * somebody to speak for them. Everyone else answers only for the adventurers
 * they built.
 */
export async function membershipFor(campaignId: string, userId: string): Promise<Membership> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      ownerId: true,
      party: { select: { characterId: true, character: { select: { userId: true } } } },
    },
  });

  if (!campaign) return { isMember: false, isOwner: false, controlledCharacterIds: [] };

  const isOwner = campaign.ownerId === userId;
  const own = campaign.party
    .filter((member) => member.character.userId === userId)
    .map((member) => member.characterId);

  return {
    isMember: isOwner || own.length > 0,
    isOwner,
    controlledCharacterIds: isOwner ? campaign.party.map((member) => member.characterId) : own,
  };
}
