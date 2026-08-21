"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { resetCharacter, type ResetMode, type ResetPlan } from "@/lib/game/reset";
import { ALL_SKILLS } from "@/lib/game/character-options";
import { SKILLS_PER_CHARACTER, STATS, type StatBlock } from "@/lib/game/rules";
import { db } from "@/lib/db";

export type ResetFormState = { error?: string };

/**
 * The two she starts again with, filtered to skills that actually exist.
 *
 * Same shape as the builder's own parser, and deliberately forgiving in the
 * same direction: unknown names are dropped rather than refused, and the list
 * is capped rather than rejected for being long. A form that sends nothing is
 * fine — an adventurer with no skills is a legal adventurer, and she will be
 * offered two on her own sheet.
 */
function parseSkills(formData: FormData): string[] {
  const chosen = formData
    .getAll("skills")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => ALL_SKILLS.includes(value));

  return [...new Set(chosen)].slice(0, SKILLS_PER_CHARACTER);
}

/**
 * A number the form may simply not have sent.
 *
 * Returned as a spreadable fragment rather than `number | undefined` so that
 * "leave it alone" and "set it to zero" stay different things — which matters
 * for experience, where nought is a real answer somebody might mean.
 */
function numberFrom(formData: FormData, name: "level" | "xp"): { level?: number } | { xp?: number } {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return {};
  return { [name]: Number(raw) } as { level?: number } | { xp?: number };
}

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
 *   3. The whole plan, checked by the same rules the builder and the ladder
 *      use. Stats can only ever be set once, at build time, so an illegal
 *      spread here would strand her somewhere the game has no way to correct.
 *
 * The mode is read from the form rather than inferred, and anything that is not
 * one of the two names falls back to re-laying her numbers — the harmless one.
 * A hand-posted form should not be able to turn "fix her spread" into "throw
 * away four evenings" by omitting a field.
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

  // Anything unrecognised is the safe one. See the note above the function.
  const mode: ResetMode =
    String(formData.get("mode") ?? "") === "START_AGAIN" ? "START_AGAIN" : "RELAY_NUMBERS";

  const plan: ResetPlan =
    mode === "START_AGAIN"
      ? { mode, build, skills: parseSkills(formData) }
      : { mode, build, ...numberFrom(formData, "level"), ...numberFrom(formData, "xp") };

  const outcome = await resetCharacter(characterId, plan);
  if (!outcome.ok) return { error: outcome.reason };

  revalidatePath("/settings/adventurers");
  revalidatePath(`/characters/${characterId}`);
  // Which of the two, and whose, so the list can say what just happened. The
  // old redirect carried `?reset=1` and nothing on the other end read it, so a
  // destructive action finished by looking exactly like a page that had not
  // done anything.
  redirect(
    `/settings/adventurers?done=${mode === "START_AGAIN" ? "again" : "relaid"}&who=${encodeURIComponent(character.name)}`,
  );
}
