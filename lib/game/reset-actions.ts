"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { resetCharacter } from "@/lib/game/reset";
import { STATS, type StatBlock } from "@/lib/game/rules";
import { db } from "@/lib/db";

export type ResetFormState = { error?: string };

/**
 * Starts an adventurer again.
 *
 * Three gates, and each one is guarding against a different mistake.
 *
 *   1. `requireAdmin`, because the whole point of putting this here is that a
 *      player asks somebody rather than doing it herself.
 *   2. The name, typed out in full. Not a "are you sure?" — those get clicked
 *      through — but the one confirmation that cannot be given by accident, and
 *      that makes resetting the wrong adventurer of two nearly impossible.
 *   3. The four numbers, checked by the same rule the builder uses. Stats can
 *      only ever be set once, at build time, so an illegal spread here would
 *      strand her somewhere the game has no way to correct.
 */
export async function resetCharacterAction(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  await requireAdmin();

  const characterId = String(formData.get("characterId") ?? "");
  if (!characterId) return { error: "Missing adventurer." };

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { name: true },
  });
  if (!character) return { error: "That adventurer no longer exists." };

  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typed.toLowerCase() !== character.name.trim().toLowerCase()) {
    return { error: `Type ${character.name} exactly, to be sure this is the right adventurer.` };
  }

  const build = Object.fromEntries(
    STATS.map((stat) => [stat, Number(formData.get(stat) ?? Number.NaN)]),
  ) as StatBlock;

  const outcome = await resetCharacter(characterId, build);
  if (!outcome.ok) return { error: outcome.reason };

  revalidatePath("/settings/adventurers");
  revalidatePath(`/characters/${characterId}`);
  redirect("/settings/adventurers?reset=1");
}
