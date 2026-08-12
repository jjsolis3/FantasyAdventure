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
import type { SignatureEffect } from "@/lib/game/character-options";

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
  /**
   * The kind of thing being attempted, in a word — "climbing", "persuading".
   *
   * Carried through the roll so the turn can file it afterwards. What gets
   * practised is the kind of thing, not this particular attempt at it.
   */
  practice?: string;
  /**
   * What her knacks add to this kind of check.
   *
   * Separate from the skill bonus so the roll can be explained honestly: "+1
   * because you are Sure-footed" is a different sentence from "+2 because you
   * are good at climbing", and a child deserves to be told which is which.
   */
  knackBonus?: number;
};

/**
 * A Family Move spent on this check.
 *
 * Applied here rather than in narration because the effect has to be real: if
 * a move only changed the wording, bonds would be decoration and the children
 * would work that out within two sessions.
 */
export type MoveEffect = {
  key: string;
  moveName: string;
  /** The character lending the help. */
  helperName: string;
};

/**
 * A once-a-scene or once-a-chapter ability spent on this turn.
 *
 * `own` is what this character spent herself; `boost` is what somebody else
 * spent that happens to help her. They are separate because the two arrive from
 * opposite directions — one is on her own answer, the other is on a sibling's —
 * and because an ability that boosts *others* must never boost its owner, which
 * is far easier to guarantee when her own spend cannot be mistaken for a boost.
 */
export type AbilitySpend = {
  own?: { name: string; effect: SignatureEffect } | null;
  boost?: { amount: number; fromName: string } | null;
};

export type CheckResult = CheckRequest & {
  roll: number;
  modifier: number;
  skillBonus: number;
  total: number;
  target: number;
  outcome: CheckOutcome;
  /** Set when a Family Move altered this check. */
  move?: MoveEffect & { note: string };
  /** Set when a spent ability altered this check. */
  ability?: { name: string; note: string };
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
 *
 * When a Family Move is supplied its effect is applied here, and `move.note`
 * records what it actually did so both the transcript and the Game Master can
 * say so.
 */
export function resolveCheck(
  request: CheckRequest,
  stats: Record<StatKey, number>,
  roller: () => number = rollD20,
  move?: MoveEffect,
  spend?: AbilitySpend,
): CheckResult {
  const modifier = statModifier(stats[request.stat]) + (request.knackBonus ?? 0);
  const skillBonus = request.skillRank ?? 0;
  const target = DIFFICULTIES[request.difficulty];

  // Somebody else's "everyone but me does better" lands here, before anything
  // is rolled, so it is part of every path through the Family Move switch below
  // rather than a correction bolted on after one of them.
  const lent = spend?.boost?.amount ?? 0;

  const settle = (roll: number, bonus = 0) => {
    const total = roll + modifier + skillBonus + bonus + lent;
    return { roll, total, outcome: resolveOutcome(roll, total, target) };
  };

  let attempt = settle(roller());
  let note = "";

  switch (move?.key) {
    case "lend_a_hand": {
      attempt = settle(attempt.roll, 2);
      note = `${move.helperName} lends a hand: +2`;
      break;
    }
    case "stand_together": {
      const second = settle(roller());
      const better = second.total > attempt.total ? second : attempt;
      note = `${move.helperName} stands with them: rolled ${attempt.roll} and ${second.roll}, kept ${better.roll}`;
      attempt = better;
      break;
    }
    case "never_alone": {
      if (attempt.outcome === "COMPLICATION") {
        const retry = settle(roller());
        note = `${move.helperName} will not let them fail alone: ${attempt.roll} became ${retry.roll}`;
        attempt = retry;
      } else {
        // Spent but not needed. Saying so is fairer than silently wasting it.
        note = `${move.helperName} was ready to catch them, and did not need to be`;
      }
      break;
    }
    case "two_as_one": {
      if (attempt.outcome === "PARTIAL") {
        note = `${move.helperName} moves as one with them: a near miss becomes a success`;
        attempt = { ...attempt, outcome: "SUCCESS" };
      } else {
        note = `${move.helperName} matched them step for step`;
      }
      break;
    }
    case "hearthlight": {
      note = `${move.helperName} and everything they have been through together: it simply works`;
      attempt = { ...attempt, outcome: "SUCCESS" };
      break;
    }
    default:
      break;
  }

  // Applied after the Family Move, deliberately. Both can land on one check —
  // a sister lends a hand on the same roll a girl spends Steady Hand — and when
  // they do, "it simply works" has to be the last word, or the move could talk
  // her out of her own certainty.
  const abilityNotes: string[] = [];
  if (spend?.boost) {
    abilityNotes.push(`${spend.boost.fromName} carries them: +${spend.boost.amount}`);
  }
  if (spend?.own?.effect.kind === "AUTO_SUCCEED" && attempt.outcome !== "CRITICAL") {
    // A natural 20 is left alone. It is already the best thing that can happen,
    // and taking a critical away from a child because she also spent something
    // would be the single meanest line in this file.
    abilityNotes.push(`${spend.own.name}: no roll needed — it simply works`);
    attempt = { ...attempt, outcome: "SUCCESS" };
  }

  return {
    ...request,
    roll: attempt.roll,
    modifier,
    skillBonus,
    total: attempt.total,
    target,
    outcome: attempt.outcome,
    ...(move ? { move: { ...move, note } } : {}),
    ...(abilityNotes.length > 0
      ? { ability: { name: spend?.own?.name ?? "Helped", note: abilityNotes.join("; ") } }
      : {}),
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

  const moveLine = result.move ? `\n  FAMILY MOVE — ${result.move.moveName}: ${result.move.note}` : "";

  return (
    `${result.characterName} attempts: ${result.intent}\n` +
    `  ${STAT_INFO[result.stat].label} check` +
    (result.skillName ? ` (using ${result.skillName})` : "") +
    ` vs ${result.difficulty} (${result.target})\n` +
    `  rolled ${result.roll}${bonusText} = ${result.total} → ${outcomeText[result.outcome]}` +
    moveLine
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
