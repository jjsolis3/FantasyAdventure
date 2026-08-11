"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { STATS, STAT_CEILING, statPointsUnspent, type StatBlock, type StatKey } from "@/lib/game/rules";
import { knacksUnspent, offerFor } from "@/lib/game/knacks";

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

/**
 * Taking a knack.
 *
 * The offer is recomputed server-side rather than trusted from the form. The
 * three she was shown are a pure function of her own state, so the server can
 * work out the same three — and a hand-posted key for something she was never
 * offered gets nothing. Without that, the whole "earned, not browsed" idea
 * would be a suggestion rather than a rule.
 */
export async function chooseKnackAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const characterId = String(formData.get("characterId") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!characterId || !key) return;

  const character = await db.character.findFirst({
    where: { id: characterId, userId: user.id },
    include: {
      knacks: { select: { key: true } },
      practices: { select: { key: true, attempts: true } },
    },
  });
  if (!character) return;

  const taken = character.knacks.map((knack) => knack.key);
  if (knacksUnspent(character.level, taken.length) <= 0) return;

  const offered = offerFor({
    characterId: character.id,
    level: character.level,
    stats: {
      might: character.might,
      wits: character.wits,
      heart: character.heart,
      spark: character.spark,
    },
    practices: character.practices,
    taken,
  });
  if (!offered.some((knack) => knack.key === key)) return;

  await db.characterKnack.create({
    data: { characterId, key, chosenAtLevel: character.level },
  });

  revalidatePath(`/characters/${characterId}`);
}
