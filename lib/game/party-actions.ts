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

/**
 * Takes somebody out of the party. Owner only, at any point.
 *
 * Deliberately blunter than the character delete: nothing is destroyed here.
 * The adventurer keeps their level, their things and their ties, and can be
 * brought back with the join code — so the honest confirmation is a sentence
 * rather than a ceremony.
 */
export async function removePartyMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const campaignId = String(formData.get("campaignId") ?? "");
  const characterId = String(formData.get("characterId") ?? "");
  if (!campaignId || !characterId) return;

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ownerId: user.id },
    select: { id: true, party: { select: { characterId: true } } },
  });
  if (!campaign) return;

  // An adventure with nobody in it cannot be begun or played, and the storyteller
  // would be narrating to an empty room.
  if (campaign.party.length <= 1) return;

  await db.$transaction(async (tx) => {
    await tx.partyMember.deleteMany({ where: { campaignId, characterId } });

    // Their answer would otherwise sit in an open round that is now waiting for
    // somebody who is not in the party, which nothing would ever satisfy.
    await tx.roundAnswer.deleteMany({
      where: { characterId, round: { campaignId, status: { in: ["COLLECTING", "RESOLVING"] } } },
    });

    await resequence(tx, campaignId);
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/play`);
}

/**
 * Moves somebody up or down the turn order. Owner only.
 *
 * The order is who the storyteller hears first, which matters more than it
 * sounds: the party's answers are read in this order, so the child who always
 * goes last is always reacting to everybody else.
 */
export async function movePartyMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const campaignId = String(formData.get("campaignId") ?? "");
  const characterId = String(formData.get("characterId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!campaignId || !characterId || (direction !== "up" && direction !== "down")) return;

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ownerId: user.id },
    select: { id: true },
  });
  if (!campaign) return;

  await db.$transaction(async (tx) => {
    const party = await tx.partyMember.findMany({
      where: { campaignId },
      orderBy: { position: "asc" },
      select: { id: true, characterId: true },
    });

    const from = party.findIndex((member) => member.characterId === characterId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= party.length) return;

    const reordered = [...party];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];

    // Positions are rewritten from scratch rather than swapped in place: the
    // unique key is (campaign, character), not position, so there is nothing to
    // collide with and nothing to do in two steps.
    for (const [index, member] of reordered.entries()) {
      await tx.partyMember.update({ where: { id: member.id }, data: { position: index } });
    }
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/play`);
}

/**
 * Puts an adventure down, or picks it back up. Owner only.
 *
 * A paused adventure refuses turns rather than merely looking different: the
 * turn pipeline already declines anything that is not ACTIVE, so this needs no
 * special case anywhere else. Useful when a family is away for a month and does
 * not want a half-answered round sitting open, and when one child is grounded.
 */
export async function setCampaignPausedAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const campaignId = String(formData.get("campaignId") ?? "");
  const paused = String(formData.get("paused") ?? "") === "true";
  if (!campaignId) return;

  const updated = await db.campaign.updateMany({
    where: { id: campaignId, ownerId: user.id, status: paused ? "ACTIVE" : "PAUSED" },
    data: { status: paused ? "PAUSED" : "ACTIVE" },
  });
  if (updated.count === 0) return;

  if (paused) {
    await db.turnRound.updateMany({
      where: { campaignId, status: { in: ["COLLECTING", "RESOLVING"] } },
      data: { status: "CANCELLED" },
    });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/play`);
  revalidatePath("/campaigns");
}

/** Closes the gaps left in the turn order by somebody leaving. */
async function resequence(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  campaignId: string,
): Promise<void> {
  const party = await tx.partyMember.findMany({
    where: { campaignId },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  for (const [index, member] of party.entries()) {
    await tx.partyMember.update({ where: { id: member.id }, data: { position: index } });
  }
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
