/**
 * How it went.
 *
 * Finishing an adventure used to write one line — "The Dragon Who Lost Her Name
 * is complete. What a journey." — and that was the whole of it. Everything the
 * evening had actually produced was scattered: quests on one page, keepsakes on
 * another, experience folded silently into a number, and the private aim
 * nobody else had seen revealed in a transcript that had already scrolled past.
 *
 * So this gathers it. Nothing here is new information; it is the same evening
 * read back, per girl, at the moment she most wants to know what she got.
 *
 * Derived rather than stored, deliberately. Every figure below can be worked
 * out from rows that already exist, which means no snapshot to write at the
 * ending, nothing to drift out of step with the truth, and a summary that stays
 * correct if a turn is taken back afterwards.
 */

import { xpForOutcome, type CheckOutcome } from "@/lib/engine/dice";
import { QUEST_XP } from "@/lib/game/rules";

export type RollRecord = {
  characterId: string;
  outcome: CheckOutcome;
};

/**
 * What the dice earned each character on this adventure.
 *
 * Read back out of the dice rolls themselves rather than recorded as a running
 * total. A character's experience is cumulative across every story she has been
 * in, so "what she earned *here*" has to be reconstructed — and the rolls are
 * still sitting in the transcript with their outcomes on them.
 */
export function xpFromRolls(rolls: RollRecord[]): Map<string, number> {
  const earned = new Map<string, number>();

  for (const roll of rolls) {
    earned.set(roll.characterId, (earned.get(roll.characterId) ?? 0) + xpForOutcome(roll.outcome));
  }

  return earned;
}

export type QuestRecord = {
  kind: "MAIN" | "SIDE" | "PERSONAL";
  status: "ACTIVE" | "COMPLETE" | "ABANDONED";
  secretForCharacterId: string | null;
};

/**
 * What the quests paid, per character.
 *
 * Chapters and side quests paid everybody who travelled; a personal aim paid
 * only the girl whose it was. Worked out the same way it was awarded, so the
 * two can never disagree.
 */
export function xpFromQuests(
  quests: QuestRecord[],
  partyCharacterIds: string[],
): Map<string, number> {
  const earned = new Map<string, number>();
  const add = (characterId: string, amount: number) =>
    earned.set(characterId, (earned.get(characterId) ?? 0) + amount);

  for (const quest of quests) {
    if (quest.status !== "COMPLETE") continue;

    if (quest.kind === "PERSONAL") {
      if (quest.secretForCharacterId) add(quest.secretForCharacterId, QUEST_XP.PERSONAL);
      continue;
    }

    for (const characterId of partyCharacterIds) add(characterId, QUEST_XP[quest.kind]);
  }

  return earned;
}

/** Two tallies read as one number to the girl looking at it. */
export function totalXp(
  characterId: string,
  fromRolls: Map<string, number>,
  fromQuests: Map<string, number>,
): number {
  return (fromRolls.get(characterId) ?? 0) + (fromQuests.get(characterId) ?? 0);
}

/**
 * How the party did on what the story asked of them.
 *
 * Counted rather than scored. A percentage would invite comparing this evening
 * to the last one, and an adventure where the family talked to the troll for an
 * hour instead of finding the key is not a worse adventure.
 */
export function tally(quests: QuestRecord[]): {
  chapters: number;
  chaptersLeft: number;
  errands: number;
  ownAims: number;
} {
  const done = (kind: QuestRecord["kind"]) =>
    quests.filter((quest) => quest.kind === kind && quest.status === "COMPLETE").length;

  return {
    chapters: done("MAIN"),
    // Named as left behind rather than failed. The story moved on; that is not
    // the same as having lost.
    chaptersLeft: quests.filter((quest) => quest.kind === "MAIN" && quest.status === "ABANDONED")
      .length,
    errands: done("SIDE"),
    ownAims: done("PERSONAL"),
  };
}

/** A line for the top of the page, in the register the rest of the game uses. */
export function verdict(counts: ReturnType<typeof tally>, finished: boolean): string {
  if (!finished) return "Still going.";
  if (counts.chaptersLeft > 0) {
    return "You got there — not by the road anybody expected, which is usually the better story.";
  }
  return "Every chapter finished. That is not nothing.";
}
