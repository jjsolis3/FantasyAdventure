/**
 * Dice and check resolution.
 *
 * **The server rolls, never the model.** If the AI decides outcomes, character
 * stats stop meaning anything and the game becomes a story generator with
 * decorative numbers. The Game Master proposes which checks a turn needs; this
 * module decides how they land; the Game Master then narrates the result it is
 * given.
 *
 * Deliberately import-free apart from node:crypto so it stays trivially
 * testable and can be reasoned about on its own.
 */

import { randomInt } from "node:crypto";
import { STAT_INFO, statModifier, type StatKey } from "@/lib/game/rules";

export const DIFFICULTIES = {
  EASY: 8,
  NORMAL: 12,
  HARD: 16,
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;

export type CheckOutcome =
  /** Natural 20, or beat the target by 5+. Something extra goes right. */
  | "CRITICAL"
  | "SUCCESS"
  /** Missed by 1–2. It works, but at a cost. */
  | "PARTIAL"
  /** Natural 1, or missed by 3+. Never a flat "nothing happens". */
  | "COMPLICATION";

export type CheckRequest = {
  characterId: string;
  characterName: string;
  stat: StatKey;
  difficulty: Difficulty;
  /** What the character is trying to do, in the GM's words. */
  intent: string;
  /** Rank of a relevant skill, if the character has one. */
  skillRank?: number;
  skillName?: string;
};

export type CheckResult = CheckRequest & {
  roll: number;
  modifier: number;
  skillBonus: number;
  total: number;
  target: number;
  outcome: CheckOutcome;
};

/** Rolls a fair d20 using a cryptographic source, not Math.random. */
export function rollD20(): number {
  return randomInt(1, 21);
}

export function resolveOutcome(roll: number, total: number, target: number): CheckOutcome {
  // Natural 20 and natural 1 always mean something, regardless of modifiers —
  // it keeps the dice exciting for a ten-year-old.
  if (roll === 20) return "CRITICAL";
  if (roll === 1) return "COMPLICATION";

  const margin = total - target;
  if (margin >= 5) return "CRITICAL";
  if (margin >= 0) return "SUCCESS";
  if (margin >= -2) return "PARTIAL";
  return "COMPLICATION";
}

/**
 * Resolves one check. `roller` is injectable so tests can be deterministic.
 */
export function resolveCheck(
  request: CheckRequest,
  stats: Record<StatKey, number>,
  roller: () => number = rollD20,
): CheckResult {
  const roll = roller();
  const modifier = statModifier(stats[request.stat]);
  const skillBonus = request.skillRank ?? 0;
  const total = roll + modifier + skillBonus;
  const target = DIFFICULTIES[request.difficulty];

  return {
    ...request,
    roll,
    modifier,
    skillBonus,
    total,
    target,
    outcome: resolveOutcome(roll, total, target),
  };
}

/** A short line the Game Master is shown so it can narrate the right result. */
export function describeResult(result: CheckResult): string {
  const bonus = result.modifier + result.skillBonus;
  const bonusText = bonus === 0 ? "" : bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`;

  const outcomeText: Record<CheckOutcome, string> = {
    CRITICAL: "CRITICAL SUCCESS — it works, and something extra goes right",
    SUCCESS: "SUCCESS — it works",
    PARTIAL: "PARTIAL — it works, but there is a cost or complication",
    COMPLICATION: "COMPLICATION — it does not work; something new gets in the way",
  };

  return (
    `${result.characterName} attempts: ${result.intent}\n` +
    `  ${STAT_INFO[result.stat].label} check` +
    (result.skillName ? ` (using ${result.skillName})` : "") +
    ` vs ${result.difficulty} (${result.target})\n` +
    `  rolled ${result.roll}${bonusText} = ${result.total} → ${outcomeText[result.outcome]}`
  );
}

/** XP awarded to the acting character, by outcome. Trying is always worth something. */
export function xpForOutcome(outcome: CheckOutcome): number {
  switch (outcome) {
    case "CRITICAL":
      return 3;
    case "SUCCESS":
      return 2;
    case "PARTIAL":
      return 2;
    case "COMPLICATION":
      // Failing forward still teaches you something, and a child who rolled
      // badly should not also be punished with nothing.
      return 1;
  }
}
