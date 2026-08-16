"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";
import { SLOTS, lookColumns, type Look } from "@/lib/game/wardrobe";

/**
 * Saving what she looks like.
 *
 * Its own action rather than a few more fields on `updateCharacterAction`, and
 * that separation is the same lesson this codebase has already learned twice:
 * the builder builds, play grows, and two writers on one row is how a save
 * button silently deletes something somebody earned. A wardrobe is neither — it
 * is changeable any evening, costs nothing, and takes nothing away.
 *
 * Free text is accepted in every slot. The catalogue is a starting point, not a
 * fence: a child who wants a coat made of bees should get one, exactly as she
 * can already be a Cloud Baker. So the only checks here are ownership and
 * length.
 */
export async function saveLookAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const id = formData.get("characterId");
  if (typeof id !== "string") return { error: "Missing character." };

  // Scoped by userId so one household cannot dress another's adventurers.
  const existing = await db.character.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return { error: "Character not found." };

  const look: Look = {};
  for (const slot of SLOTS) {
    const value = formData.get(slot);
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 120) {
      return { error: "One of those is a bit long — keep each one under 120 characters." };
    }
    if (trimmed) look[slot] = trimmed;
  }

  // `lookColumns` always writes every slot, so taking the helmet off actually
  // takes it off. A partial update would leave it on forever.
  await db.character.update({ where: { id }, data: lookColumns(look) });

  revalidatePath("/characters");
  revalidatePath(`/characters/${id}`);
  revalidatePath(`/characters/${id}/look`);
  return { error: "" };
}
