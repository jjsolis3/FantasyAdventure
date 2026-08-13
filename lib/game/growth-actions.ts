"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import {
  STATS,
  STAT_CEILING,
  statPointsUnspent,
  statsOf,
  type StatBlock,
  type StatKey,
} from "@/lib/game/rules";
import { knacksUnspent, offerFor } from "@/lib/game/knacks";
import { mayChoose } from "@/lib/game/skill-offer";

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

  const stats: StatBlock = statsOf(character);

  // Both guards matter and they are different: one says she has earned a point,
  // the other says this particular stat has room for it.
  if (statPointsUnspent(stats, character.xp, character.buildBudget) <= 0) return;
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
    stats: statsOf(character),
    practices: character.practices,
    taken,
  });
  if (!offered.some((knack) => knack.key === key)) return;

  await db.characterKnack.create({
    data: { characterId, key, chosenAtLevel: character.level },
  });

  revalidatePath(`/characters/${characterId}`);
}

/**
 * Taking a skill at level-up.
 *
 * Checked the same way a knack is: the rule is recomputed here from her own
 * state rather than trusted from the form. The difference is that a skill may
 * legitimately come from the whole list rather than only the three suggested —
 * browsing is deliberate — so what is enforced is that she has a pick left, that
 * it is a real skill, and that she does not already have it.
 *
 * `chosenAtLevel` is what makes the pick countable. Without it a girl who
 * practised her way to four skills would look as though she had spent four
 * choices, and would silently lose them.
 */
export async function chooseSkillAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const characterId = String(formData.get("characterId") ?? "");
  const skill = String(formData.get("skill") ?? "").trim();
  if (!characterId || !skill) return;

  const character = await db.character.findFirst({
    where: { id: characterId, userId: user.id },
    include: {
      skills: { select: { name: true, chosenAtLevel: true } },
      practices: { select: { key: true, label: true, attempts: true } },
    },
  });
  if (!character) return;

  const input = {
    archetype: character.archetype,
    level: character.level,
    held: character.skills.map((entry) => entry.name),
    chosen: character.skills.filter((entry) => entry.chosenAtLevel !== null).length,
    practices: character.practices,
  };

  if (!mayChoose(skill, input)) return;

  await db.characterSkill.create({
    data: { characterId, name: skill, chosenAtLevel: character.level },
  });

  revalidatePath(`/characters/${characterId}`);
  revalidatePath("/characters");
}
