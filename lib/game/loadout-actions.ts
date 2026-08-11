"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { membershipFor } from "@/lib/game/access";
import { SUPPLIES_PER_CHARACTER, wasOffered } from "@/lib/game/loadout";

/**
 * Packing, and changing your mind about it.
 *
 * Only while the adventure is still being prepared. Once the story has started,
 * things arrive by being found — letting somebody reach back into the cupboard
 * mid-chapter would make every "do we have a rope?" answerable with yes, and
 * the whole point of packing is that you decided beforehand.
 */
async function loadoutContext(formData: FormData, userId: string) {
  const campaignId = String(formData.get("campaignId") ?? "");
  const characterId = String(formData.get("characterId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!campaignId || !characterId || !name) return null;

  const membership = await membershipFor(campaignId, userId);
  if (!membership.isMember) return null;

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, tone: true },
  });
  // Packing closes when the story opens.
  if (!campaign || campaign.status !== "SETUP") return null;

  const member = await db.partyMember.findFirst({
    where: { campaignId, characterId },
    include: { character: { select: { id: true, userId: true, archetype: true } } },
  });
  if (!member) return null;

  // Your own adventurers are yours to pack; whoever is running the table packs
  // for anybody, which is how a five-year-old without an account gets a lantern.
  const mayPack = membership.isOwner || member.character.userId === userId;
  if (!mayPack) return null;

  return { campaign, character: member.character, name };
}

export async function bringSupplyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const context = await loadoutContext(formData, user.id);
  if (!context) return;

  const { campaign, character, name } = context;

  // Only from her own list. Without this a hand-posted form could pack a sword
  // of great smiting, and the storyteller would take it perfectly seriously.
  const supply = wasOffered(character.archetype, campaign.tone, name);
  if (!supply) return;

  const packed = await db.inventoryItem.count({
    where: { characterId: character.id, foundInCampaignId: campaign.id, brought: true },
  });
  if (packed >= SUPPLIES_PER_CHARACTER) return;

  await db.inventoryItem.upsert({
    where: { characterId_name: { characterId: character.id, name: supply.name } },
    create: {
      characterId: character.id,
      name: supply.name,
      description: supply.description,
      // Tagged to this adventure like anything else found on it, which is what
      // lets a thing you brought from home satisfy one of its quests.
      foundInCampaignId: campaign.id,
      brought: true,
    },
    // Already carrying one from a previous story: take a second rather than
    // failing on the unique key.
    update: { quantity: { increment: 1 } },
  });

  revalidatePath(`/campaigns/${campaign.id}`);
}

export async function leaveSupplyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const context = await loadoutContext(formData, user.id);
  if (!context) return;

  const { campaign, character, name } = context;

  const item = await db.inventoryItem.findUnique({
    where: { characterId_name: { characterId: character.id, name } },
  });
  // Only what was packed for this adventure. Something she found in an earlier
  // story is hers, and the packing screen has no business taking it off her.
  if (!item || !item.brought || item.foundInCampaignId !== campaign.id) return;

  if (item.quantity > 1) {
    await db.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: 1 } } });
  } else {
    await db.inventoryItem.delete({ where: { id: item.id } });
  }

  revalidatePath(`/campaigns/${campaign.id}`);
}
