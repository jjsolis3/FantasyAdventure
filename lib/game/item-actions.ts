"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { membershipFor } from "@/lib/game/access";

/**
 * Handing something to somebody else in the party.
 *
 * Until now whoever picked a thing up was stuck with it forever, which is a
 * strange rule for a game about a family helping each other — and a real
 * problem once a chapter wants the key and the key is in the pocket of the
 * child who has gone to bed. "Here, you take it" is the most ordinary sentence
 * at a table and it had no way of happening.
 *
 * Who may do it follows the rule everything else follows: you move your own
 * adventurer's things, and whoever is running the table can move anybody's —
 * which is how a five-year-old without an account of their own still gets to
 * hand over the lantern.
 */
export async function giveItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const campaignId = String(formData.get("campaignId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const toCharacterId = String(formData.get("toCharacterId") ?? "");
  if (!campaignId || !itemId || !toCharacterId) return;

  const membership = await membershipFor(campaignId, user.id);
  if (!membership.isMember) return;

  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    include: { character: { select: { id: true, userId: true } } },
  });
  if (!item) return;

  // Both ends have to be travelling in this adventure. Without that check an
  // item could be posted to a character in somebody else's story.
  const party = await db.partyMember.findMany({
    where: { campaignId },
    select: { characterId: true },
  });
  const inParty = new Set(party.map((member) => member.characterId));
  if (!inParty.has(item.characterId) || !inParty.has(toCharacterId)) return;
  if (item.characterId === toCharacterId) return;

  const mayMove = membership.isOwner || item.character.userId === user.id;
  if (!mayMove) return;

  await db.$transaction(async (tx) => {
    // A second rope should raise the receiver's count rather than collide with
    // the unique key on (character, name).
    const existing = await tx.inventoryItem.findUnique({
      where: { characterId_name: { characterId: toCharacterId, name: item.name } },
    });

    if (existing) {
      await tx.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: 1 } },
      });
    } else {
      await tx.inventoryItem.create({
        data: {
          characterId: toCharacterId,
          name: item.name,
          description: item.description,
          // Where it was found does not change by being handed over — that is
          // what keeps it counting toward this adventure's quests.
          foundInCampaignId: item.foundInCampaignId,
        },
      });
    }

    // Give one away, not the whole stack.
    if (item.quantity > 1) {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: 1 } },
      });
    } else {
      await tx.inventoryItem.delete({ where: { id: item.id } });
    }
  });

  revalidatePath(`/campaigns/${campaignId}/finds`);
  revalidatePath(`/campaigns/${campaignId}/play`);
}
