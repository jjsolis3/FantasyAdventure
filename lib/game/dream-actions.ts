"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { WISH_MAX } from "@/lib/game/dreams";
import type { FormState } from "@/lib/auth/actions";

/**
 * Writing down, changing and ending a long wish.
 *
 * ## Who is allowed
 *
 * The adventurer's own household, and nobody else. A dream is the most personal
 * thing on a sheet and the one place another table having write access would be
 * plainly wrong — unlike a bond, which by its nature belongs to two people.
 *
 * ## Why answering is here and not in the pipeline
 *
 * This file holds the only route to `ANSWERED`. The storyteller has no way to
 * reach it — not through extraction, not through a deed, not through anything.
 * That is the whole feature: a model that ends a year-long wish because the
 * scene was going well has spent the thing that made next Saturday matter, and
 * nobody can give it back. So it ends when a person says it ended, and they say
 * how.
 */

const wishSchema = z.object({
  characterId: z.string().min(1),
  wish: z
    .string()
    .trim()
    .min(1, "Write down the thing she wants most.")
    .max(WISH_MAX, `Keep it under ${WISH_MAX} characters — a wish, not a plan.`),
});

/** The character, if this household may write to it. */
async function ownedBy(characterId: string, userId: string) {
  return db.character.findFirst({
    where: { id: characterId, userId },
    select: { id: true, name: true },
  });
}

export async function setDreamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = wishSchema.safeParse({
    characterId: formData.get("characterId"),
    wish: formData.get("wish"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That will not do." };
  }

  const character = await ownedBy(parsed.data.characterId, user.id);
  if (!character) return { error: "That adventurer is not yours." };

  // One at a time. Rewriting the wish she already has rather than stacking a
  // second, because two ambitions is a to-do list and this is meant to be the
  // one thing she wants.
  const existing = await db.dream.findFirst({
    where: { characterId: character.id, status: "ACTIVE" },
  });

  if (existing) {
    await db.dream.update({ where: { id: existing.id }, data: { wish: parsed.data.wish } });
  } else {
    await db.dream.create({ data: { characterId: character.id, wish: parsed.data.wish } });
  }

  revalidatePath(`/characters/${character.id}`);
  return { error: "" };
}

const answerSchema = z.object({
  dreamId: z.string().min(1),
  note: z.string().trim().max(300).optional(),
  /** Which adventure it happened in, when the family is in one. */
  campaignId: z.string().optional(),
});

export async function answerDreamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = answerSchema.safeParse({
    characterId: formData.get("characterId"),
    dreamId: formData.get("dreamId"),
    note: formData.get("note") ?? undefined,
    campaignId: formData.get("campaignId") ?? undefined,
  });
  if (!parsed.success) return { error: "That will not do." };

  const dream = await db.dream.findFirst({
    where: { id: parsed.data.dreamId, character: { userId: user.id } },
    include: { character: { select: { id: true } } },
  });
  if (!dream) return { error: "That wish is not yours to close." };
  if (dream.status !== "ACTIVE") return { error: "That one is already closed." };

  // The title as well as the id, so the record survives the adventure being
  // deleted. It came true whether or not the story it happened in is still on
  // the shelf.
  const campaign = parsed.data.campaignId
    ? await db.campaign.findUnique({
        where: { id: parsed.data.campaignId },
        select: { id: true, title: true },
      })
    : null;

  await db.dream.update({
    where: { id: dream.id },
    data: {
      status: "ANSWERED",
      answeredAt: new Date(),
      answeredNote: parsed.data.note?.trim() || null,
      answeredInCampaignId: campaign?.id ?? null,
      answeredInCampaignTitle: campaign?.title ?? null,
    },
  });

  revalidatePath(`/characters/${dream.character.id}`);
  return { error: "" };
}

export async function setAsideDreamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const dreamId = String(formData.get("dreamId") ?? "");
  if (!dreamId) return { error: "That will not do." };

  const dream = await db.dream.findFirst({
    where: { id: dreamId, character: { userId: user.id } },
    include: { character: { select: { id: true } } },
  });
  if (!dream) return { error: "That wish is not yours." };

  // Kept rather than deleted. What a child wanted at nine is worth being able
  // to read back at eleven, even after she has changed her mind.
  await db.dream.update({ where: { id: dream.id }, data: { status: "SET_ASIDE" } });

  revalidatePath(`/characters/${dream.character.id}`);
  return { error: "" };
}
