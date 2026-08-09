"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, isUniqueViolation } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { generateJoinCode, normaliseInviteCode } from "@/lib/auth/invite-code";
import type { FormState } from "@/lib/auth/actions";

const joinSchema = z.object({
  code: z.string().trim().min(1, "Type the code you were given."),
  characterId: z.string().min(1, "Choose who is coming along."),
});

/**
 * Brings one of this household's adventurers into somebody else's adventure.
 *
 * Joining *is* membership: there is no separate invitation to accept, because
 * the only reason to be in an adventure is to have somebody in the party. That
 * keeps one list where there could have been two that disagree.
 */
export async function joinCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = joinSchema.safeParse({
    code: formData.get("code"),
    characterId: formData.get("characterId"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const campaign = await db.campaign.findUnique({
    where: { joinCode: normaliseInviteCode(parsed.data.code) },
    include: { storyline: { select: { maxPlayers: true, title: true } }, party: true },
  });
  if (!campaign) {
    return { error: "That code does not match any adventure. Check it and try again." };
  }
  if (campaign.status === "COMPLETE") {
    return { error: `${campaign.title} has already finished.` };
  }

  const character = await db.character.findFirst({
    where: { id: parsed.data.characterId, userId: user.id },
    select: { id: true, name: true },
  });
  if (!character) return { error: "That adventurer could not be found." };

  // Already travelling: say so by arriving, rather than by refusing. Somebody
  // who follows the same link twice meant to get to the adventure both times.
  if (campaign.party.some((member) => member.characterId === character.id)) {
    redirect(`/campaigns/${campaign.id}`);
  }

  if (campaign.party.length >= campaign.storyline.maxPlayers) {
    return {
      error: `${campaign.title} is full — it takes ${campaign.storyline.maxPlayers} adventurers.`,
    };
  }

  const position = campaign.party.reduce((highest, member) => Math.max(highest, member.position), -1) + 1;

  await db.partyMember.create({
    data: { campaignId: campaign.id, characterId: character.id, position },
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath(`/campaigns/${campaign.id}/play`);
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

/**
 * Takes this household's adventurers back out again.
 *
 * Only before the first scene is narrated. Once the storyteller has described
 * somebody, removing them leaves a transcript talking about a person who,
 * according to the party list, was never there.
 */
export async function leaveCampaignAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) return;

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, ownerId: true, status: true },
  });
  // The household that started it cannot leave it; that is what "remove this
  // adventure" is for.
  if (!campaign || campaign.ownerId === user.id || campaign.status !== "SETUP") return;

  await db.partyMember.deleteMany({
    where: { campaignId, character: { userId: user.id } },
  });

  revalidatePath("/campaigns");
  redirect("/campaigns");
}

/** Issues a new join code, so an old one stops working. Owner only. */
export async function regenerateJoinCodeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) return;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const updated = await db.campaign.updateMany({
        where: { id: campaignId, ownerId: user.id },
        data: { joinCode: generateJoinCode() },
      });
      if (updated.count === 0) return;
      break;
    } catch (error) {
      if (attempt >= 4 || !isUniqueViolation(error)) throw error;
    }
  }

  revalidatePath(`/campaigns/${campaignId}`);
}
