"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { STATS, STAT_CEILING, statPointsUnspent, type StatBlock, type StatKey } from "@/lib/game/rules";

/**
 * Spending a point of growth.
 *
 * One way only: a stat goes up and never back down. Refunds would turn the
 * sheet into a puzzle to be optimised between chapters, and re-specced
 * characters are exactly the thing this game has no business teaching. Choosing
 * where the point goes is the decision; living with it is the rest of it.
 */
export async function raiseStatAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const characterId = String(formData.get("characterId") ?? "");
  const stat = String(formData.get("stat") ?? "") as StatKey;
  if (!characterId || !STATS.includes(stat)) return;

  // Scoped to the account that owns her, like every other edit to a sheet.
  const character = await db.character.findFirst({ where: { id: characterId, userId: user.id } });
  if (!character) return;

  const stats: StatBlock = {
    might: character.might,
    wits: character.wits,
    heart: character.heart,
    spark: character.spark,
  };

  // Both guards matter and they are different: one says she has earned a point,
  // the other says this particular stat has room for it.
  if (statPointsUnspent(stats, character.xp) <= 0) return;
  if (stats[stat] >= STAT_CEILING) return;

  await db.character.update({
    where: { id: characterId },
    data: { [stat]: stats[stat] + 1 },
  });

  revalidatePath(`/characters/${characterId}`);
}
