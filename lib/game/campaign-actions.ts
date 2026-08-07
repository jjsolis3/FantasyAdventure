"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";

const campaignSchema = z.object({
  storylineId: z.string().min(1, "Choose an adventure."),
  title: z.string().trim().min(1, "Give this adventure a name.").max(80, "That name is very long."),
  tone: z.enum(["COZY", "ADVENTUROUS"]),
  readingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

function partyIdsFrom(formData: FormData): string[] {
  return [
    ...new Set(
      formData.getAll("partyIds").filter((value): value is string => typeof value === "string"),
    ),
  ];
}

export async function createCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = campaignSchema.safeParse({
    storylineId: formData.get("storylineId"),
    title: formData.get("title"),
    tone: formData.get("tone"),
    readingLevel: formData.get("readingLevel"),
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

  if (characters.length < storyline.minPlayers) {
    return {
      error: `${storyline.title} needs at least ${storyline.minPlayers} adventurers. You have chosen ${characters.length}.`,
    };
  }
  if (characters.length > storyline.maxPlayers) {
    return {
      error: `${storyline.title} takes at most ${storyline.maxPlayers} adventurers. You have chosen ${characters.length}.`,
    };
  }

  const campaign = await db.campaign.create({
    data: {
      ownerId: user.id,
      storylineId: storyline.id,
      title: parsed.data.title,
      tone: parsed.data.tone,
      readingLevel: parsed.data.readingLevel,
      party: {
        // Turn order follows the order they were listed in the form.
        create: partyIds.map((characterId, index) => ({ characterId, position: index })),
      },
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
  if (characters.length < campaign.storyline.minPlayers) {
    return { error: `This adventure needs at least ${campaign.storyline.minPlayers} adventurers.` };
  }
  if (characters.length > campaign.storyline.maxPlayers) {
    return { error: `This adventure takes at most ${campaign.storyline.maxPlayers} adventurers.` };
  }

  await db.$transaction(async (tx) => {
    await tx.partyMember.deleteMany({ where: { campaignId: campaign.id, characterId: { notIn: partyIds } } });
    for (const [index, characterId] of partyIds.entries()) {
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
  tone: z.enum(["COZY", "ADVENTUROUS"]),
  readingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
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
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { campaignId, ...data } = parsed.data;
  const updated = await db.campaign.updateMany({ where: { id: campaignId, ownerId: user.id }, data });
  if (updated.count === 0) return { error: "Campaign not found." };

  revalidatePath(`/campaigns/${campaignId}`);
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
