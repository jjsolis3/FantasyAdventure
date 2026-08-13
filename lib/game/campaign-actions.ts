"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import { db, isUniqueViolation } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { generateJoinCode } from "@/lib/auth/invite-code";
import type { FormState } from "@/lib/auth/actions";

const campaignSchema = z.object({
  storylineId: z.string().min(1, "Choose an adventure."),
  title: z.string().trim().min(1, "Give this adventure a name.").max(80, "That name is very long."),
  tone: z.enum(["COZY", "ADVENTUROUS", "SPOOKY"]),
  readingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
  pacing: z.enum(["BRISK", "STANDARD", "LEISURELY"]).default("STANDARD"),
  inputMode: z.enum(["SHARED_SCREEN", "OWN_DEVICE"]).default("SHARED_SCREEN"),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

/**
 * Creates the campaign, retrying if its join code is already taken.
 *
 * Two random codes colliding is remote — a billion combinations against a
 * family's handful of adventures — but the column is unique, so a collision
 * would surface as an unexplained failure in the middle of setting up an
 * adventure rather than as anything a user could act on.
 */
async function createWithJoinCode(
  data: Omit<Prisma.CampaignUncheckedCreateInput, "joinCode">,
): Promise<{ id: string }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.campaign.create({
        data: { ...data, joinCode: generateJoinCode() },
        select: { id: true },
      });
    } catch (error) {
      if (attempt >= 4 || !isUniqueViolation(error)) throw error;
    }
  }
}

function idsFrom(formData: FormData, field: string): string[] {
  return [
    ...new Set(
      formData.getAll(field).filter((value): value is string => typeof value === "string"),
    ),
  ];
}

function partyIdsFrom(formData: FormData): string[] {
  return idsFrom(formData, "partyIds");
}

export async function createCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = campaignSchema.safeParse({
    storylineId: formData.get("storylineId"),
    title: formData.get("title"),
    tone: formData.get("tone"),
    readingLevel: formData.get("readingLevel"),
    pacing: formData.get("pacing") ?? undefined,
    inputMode: formData.get("inputMode") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const storyline = await db.storyline.findFirst({
    where: { id: parsed.data.storylineId, isActive: true },
  });
  if (!storyline) return { error: "That adventure is not available." };

  const partyIds = partyIdsFrom(formData);

  // Only characters from this household, and only ones that actually exist.
  const characters = await db.character.findMany({
    where: { id: { in: partyIds }, userId: user.id },
    select: { id: true },
  });
  if (characters.length !== partyIds.length) {
    return { error: "One of those adventurers could not be found." };
  }

  // Adventurers belonging to other accounts are asked rather than added. They
  // count toward the party size here so an adventure can be set up in one go,
  // but they do not become party members until they say yes — and the adventure
  // will not begin until enough of them have.
  const inviteIds = idsFrom(formData, "inviteIds").filter((id) => !partyIds.includes(id));
  const invitees = await db.character.findMany({
    where: { id: { in: inviteIds }, userId: { not: user.id } },
    select: { id: true },
  });
  if (invitees.length !== inviteIds.length) {
    return { error: "One of those adventurers could not be found." };
  }

  const size = characters.length + invitees.length;
  if (characters.length === 0) {
    return { error: "Choose at least one of your own adventurers to lead the way." };
  }
  if (size < storyline.minPlayers) {
    return {
      error: `${storyline.title} needs at least ${storyline.minPlayers} adventurers. You have chosen ${size}.`,
    };
  }
  if (size > storyline.maxPlayers) {
    return {
      error: `${storyline.title} takes at most ${storyline.maxPlayers} adventurers. You have chosen ${size}.`,
    };
  }

  const campaign = await createWithJoinCode({
    ownerId: user.id,
    storylineId: storyline.id,
    title: parsed.data.title,
    tone: parsed.data.tone,
    readingLevel: parsed.data.readingLevel,
    pacing: parsed.data.pacing,
    inputMode: parsed.data.inputMode,
    party: {
      // Turn order follows the order they were listed in the form.
      create: partyIds.map((characterId, index) => ({ characterId, position: index })),
    },
    invites: {
      create: inviteIds.map((characterId) => ({ characterId, invitedById: user.id })),
    },
  });

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

const partyUpdateSchema = z.object({ campaignId: z.string().min(1) });

export async function updatePartyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = partyUpdateSchema.safeParse({ campaignId: formData.get("campaignId") });
  if (!parsed.success) return { error: "Missing campaign." };

  const campaign = await db.campaign.findFirst({
    where: { id: parsed.data.campaignId, ownerId: user.id },
    include: { storyline: true },
  });
  if (!campaign) return { error: "Campaign not found." };

  // Once the Game Master has started narrating, the party is part of the story
  // and changing it mid-adventure would leave the transcript referring to
  // people who are no longer there.
  if (campaign.status !== "SETUP") {
    return { error: "The adventure has already begun, so the party is settled." };
  }

  const partyIds = partyIdsFrom(formData);
  const characters = await db.character.findMany({
    where: { id: { in: partyIds }, userId: user.id },
    select: { id: true },
  });
  if (characters.length !== partyIds.length) {
    return { error: "One of those adventurers could not be found." };
  }

  // Adventurers who joined with the code belong to other households, and this
  // form has never heard of them. They keep their place: the editor is "which
  // of *my* adventurers are coming", not "who is in the party".
  const guests = await db.partyMember.findMany({
    where: { campaignId: campaign.id, character: { userId: { not: user.id } } },
    orderBy: { position: "asc" },
    select: { characterId: true },
  });

  // People who have been asked but have not answered yet count toward the
  // minimum here. Without that, an owner who invited a second adventurer could
  // not save any change to the party until the invitation was accepted.
  const invited = await db.partyInvite.count({
    where: { campaignId: campaign.id, status: "PENDING" },
  });

  const size = partyIds.length + guests.length + invited;
  if (size < campaign.storyline.minPlayers) {
    return { error: `This adventure needs at least ${campaign.storyline.minPlayers} adventurers.` };
  }
  if (size > campaign.storyline.maxPlayers) {
    return { error: `This adventure takes at most ${campaign.storyline.maxPlayers} adventurers.` };
  }

  // The household's own choices lead, in the order they were picked, and the
  // guests follow — so the turn order stays stable when the form is re-saved.
  const ordered = [...partyIds, ...guests.map((guest) => guest.characterId)];

  await db.$transaction(async (tx) => {
    await tx.partyMember.deleteMany({
      where: { campaignId: campaign.id, characterId: { notIn: ordered } },
    });
    for (const [index, characterId] of ordered.entries()) {
      await tx.partyMember.upsert({
        where: { campaignId_characterId: { campaignId: campaign.id, characterId } },
        create: { campaignId: campaign.id, characterId, position: index },
        update: { position: index },
      });
    }
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  return { error: "" };
}

const settingsSchema = z.object({
  campaignId: z.string().min(1),
  title: z.string().trim().min(1, "Give this adventure a name.").max(80),
  tone: z.enum(["COZY", "ADVENTUROUS", "SPOOKY"]),
  readingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
  pacing: z.enum(["BRISK", "STANDARD", "LEISURELY"]).default("STANDARD"),
  inputMode: z.enum(["SHARED_SCREEN", "OWN_DEVICE"]).default("SHARED_SCREEN"),
  diceMode: z.enum(["SERVER", "TABLE"]).default("SERVER"),
});

export async function updateCampaignSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = settingsSchema.safeParse({
    campaignId: formData.get("campaignId"),
    title: formData.get("title"),
    tone: formData.get("tone"),
    readingLevel: formData.get("readingLevel"),
    pacing: formData.get("pacing") ?? undefined,
    inputMode: formData.get("inputMode") ?? undefined,
    diceMode: formData.get("diceMode") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { campaignId, ...data } = parsed.data;
  const updated = await db.campaign.updateMany({ where: { id: campaignId, ownerId: user.id }, data });
  if (updated.count === 0) return { error: "Campaign not found." };

  // Handing the dice back to the app mid-question would leave the table staring
  // at an ask nothing will ever collect. Same reasoning as the round below: a
  // setting changed halfway through must not strand what is already in flight.
  if (data.diceMode === "SERVER") {
    await db.pendingRoll.deleteMany({ where: { campaignId } });
  }

  // Switching to one screen mid-round would leave answers stranded in a waiting
  // room nothing renders any more.
  if (data.inputMode === "SHARED_SCREEN") {
    await db.turnRound.updateMany({
      where: { campaignId, status: { in: ["COLLECTING", "RESOLVING"] } },
      data: { status: "CANCELLED" },
    });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/play`);
  revalidatePath("/campaigns");
  return { error: "" };
}

export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("campaignId");
  if (typeof id !== "string") return;

  await db.campaign.deleteMany({ where: { id, ownerId: user.id } });

  revalidatePath("/campaigns");
  redirect("/campaigns");
}
