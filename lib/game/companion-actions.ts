"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { KIND_MAX, KNACK_MAX, NAME_MAX } from "@/lib/game/companions";
import type { FormState } from "@/lib/auth/actions";

/**
 * Taking in something small, and saying goodbye to it.
 *
 * ## Why a family may write one down rather than only finding one
 *
 * Finding one in play is the better story and the storyteller can hand one over
 * — but a girl who has decided her adventurer has a goose should not have to
 * wait for a model to agree. This is a family's own game, not an economy, and
 * the thing being protected here is her imagination rather than a drop rate.
 *
 * Closeness is not settable, and that is the line. It counts chapters actually
 * travelled together, and a number somebody could type in would say nothing.
 */

const companionSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().trim().min(1, "Give them a name.").max(NAME_MAX),
  kind: z
    .string()
    .trim()
    .min(1, "Say what they are — a wooden owl, a three-legged fox, a very serious goose.")
    .max(KIND_MAX),
  knack: z
    .string()
    .trim()
    .min(1, "Say the one thing they are good at.")
    .max(KNACK_MAX),
});

export async function saveCompanionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = companionSchema.safeParse({
    characterId: formData.get("characterId"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    knack: formData.get("knack"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That will not do." };
  }

  const { characterId, ...fields } = parsed.data;
  const character = await db.character.findFirst({
    where: { id: characterId, userId: user.id },
    select: { id: true },
  });
  if (!character) return { error: "That adventurer is not yours." };

  await db.companion.upsert({
    where: { characterId: character.id },
    // Written down rather than found, so there is no adventure to name.
    create: { characterId: character.id, ...fields, foundInCampaignTitle: "" },
    // Closeness and where they came from survive a rename. Somebody correcting
    // a spelling has not asked to have met them for the first time.
    update: fields,
  });

  revalidatePath(`/characters/${character.id}`);
  return { error: "" };
}

export async function releaseCompanionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const characterId = String(formData.get("characterId") ?? "");
  if (!characterId) return { error: "That will not do." };

  const character = await db.character.findFirst({
    where: { id: characterId, userId: user.id },
    select: { id: true },
  });
  if (!character) return { error: "That adventurer is not yours." };

  await db.companion.deleteMany({ where: { characterId: character.id } });

  revalidatePath(`/characters/${character.id}`);
  return { error: "" };
}
