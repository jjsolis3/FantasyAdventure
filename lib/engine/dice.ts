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
import { STAT_INFO, luckChance, statModifier, type StatKey } from "@/lib/game/rules";
import { nearMissFor, targetFor } from "@/lib/game/challenge";
import type { SignatureEffect } from "@/lib/game/character-options";

/**
 * The bands at the default setting.
 *
 * Kept for the many tests and callers that mean "a normal check", and equal by
 * construction to what `targetFor` returns for BALANCED — see the test that
 * holds the two together. What a band actually costs now depends on the
 * campaign's `challenge`; see `lib/game/challenge.ts` for why that lives in
 * numbers rather than in the prompt.
 */
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
  /**
   * The campaign's difficulty setting, which decides what this band costs and
   * how forgiving a near miss is. Omitted means the middle one.
   */
  challenge?: string;
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
  /**
   * Somebody else is on the same plan.
   *
   * On the request rather than in `AbilitySpend` because it is not spent — it
   * is a fact about how this attempt was made, true for everybody in the plan
   * at once, and it costs nobody anything. `bonus` is carried rather than
   * assumed so the dice never have to know what a shared plan is worth; see
   * TOGETHER_BONUS.
   */
  together?: { with: string; bonus: number };
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
  /** Set when her Luck lifted this check. */
  luck?: { from: CheckOutcome; note: string };
};

/** Rolls a fair d20 using a cryptographic source, not Math.random. */
export function rollD20(): number {
  return randomInt(1, 21);
}

/** 1–100, for the things that happen by chance rather than by roll. */
export function rollPercent(): number {
  return randomInt(1, 101);
}

/**
 * What a lucky break turns a bad result into.
 *
 * One step, never two, and never past a plain success. A critical is the die's
 * to give: a girl telling the table she rolled a natural 20 is the best thirty
 * seconds in the game, and a *chance* handing out the same word would cheapen
 * every one of them.
 */
const LUCK_LIFTS: Partial<Record<CheckOutcome, CheckOutcome>> = {
  COMPLICATION: "PARTIAL",
  PARTIAL: "SUCCESS",
};

export function resolveOutcome(
  roll: number,
  total: number,
  target: number,
  /**
   * How far under still works, at a cost. Defaults to the middle setting, so
   * every caller written before the challenge dial existed is unchanged.
   */
  nearMiss = 2,
): CheckOutcome {
  // Natural 20 and natural 1 always mean something, regardless of modifiers —
  // it keeps the dice exciting for a ten-year-old. Both stay outside the dial:
  // a table that asked for gentle should still feel a natural 1, and a table
  // that asked for tough has not asked to lose their natural 20.
  if (roll === 20) return "CRITICAL";
  if (roll === 1) return "COMPLICATION";

  const margin = total - target;
  if (margin >= 5) return "CRITICAL";
  if (margin >= 0) return "SUCCESS";
  if (margin >= -nearMiss) return "PARTIAL";
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
  /**
   * The chance Luck runs on, kept separate from `roller` on purpose.
   *
   * A test that hands in a fixed sequence of d20s is describing the dice on the
   * table, and a hidden seventh roll drawn from the same sequence would shift
   * every number after it. Separate here means every test written before Luck
   * existed still rolls exactly what it says it rolls.
   */
  luckRoller: () => number = rollPercent,
): CheckResult {
  const modifier = statModifier(stats[request.stat]) + (request.knackBonus ?? 0);
  const skillBonus = request.skillRank ?? 0;
  // Carried on the request rather than as a seventh positional argument, which
  // is both where the rest of this check's context already lives and the only
  // way to add it without renumbering forty call sites.
  const target = targetFor(request.difficulty, request.challenge);
  const nearMiss = nearMissFor(request.challenge);

  // Somebody else's "everyone but me does better" lands here, before anything
  // is rolled, so it is part of every path through the Family Move switch below
  // rather than a correction bolted on after one of them.
  const lent = spend?.boost?.amount ?? 0;

  // Working on the same plan as somebody else. Folded in beside the lent boost
  // so it is part of every path through the Family Move switch below — a
  // shared plan and a spent move can land on the same check, and they should
  // simply add up rather than one quietly replacing the other.
  const shared = request.together?.bonus ?? 0;

  const settle = (roll: number, bonus = 0) => {
    const total = roll + modifier + skillBonus + bonus + lent + shared;
    return { roll, total, outcome: resolveOutcome(roll, total, target, nearMiss) };
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

  // Last of everything, and only ever on a result that was going to disappoint.
  //
  // Late because Luck is the fallback, not a competitor: a Family Move or a
  // spent ability that has already saved the roll should be what saved it, and
  // a girl who spent something she had been holding on to must never be told
  // afterwards that she got lucky instead.
  //
  // A natural 1 is left alone. "Nothing saves a 1" is a rule the whole table
  // learns in one evening and enjoys, and a fumble that quietly works out is
  // worth less than a fumble everybody groans at.
  let luck: CheckResult["luck"];
  const lift = LUCK_LIFTS[attempt.outcome];
  if (lift && attempt.roll !== 1 && luckRoller() <= luckChance(stats.luck)) {
    luck = {
      from: attempt.outcome,
      note:
        attempt.outcome === "PARTIAL"
          ? "Luck was with them: a near miss turned out fine after all"
          : "Luck was with them: it went wrong, but not as wrong as it should have",
    };
    attempt = { ...attempt, outcome: lift };
  }

  return {
    ...request,
    roll: attempt.roll,
    modifier,
    skillBonus,
    total: attempt.total,
    target,
    outcome: attempt.outcome,
    ...(luck ? { luck } : {}),
    ...(move ? { move: { ...move, note } } : {}),
    ...(abilityNotes.length > 0
      ? { ability: { name: spend?.own?.name ?? "Helped", note: abilityNotes.join("; ") } }
      : {}),
  };
}

/** A short line the Game Master is shown so it can narrate the right result. */
export function describeResult(result: CheckResult): string {
  const bonus = result.modifier + result.skillBonus + (result.together?.bonus ?? 0);
  const bonusText = bonus === 0 ? "" : bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`;

  const outcomeText: Record<CheckOutcome, string> = {
    CRITICAL: "CRITICAL SUCCESS — it works, and something extra goes right",
    SUCCESS: "SUCCESS — it works",
    PARTIAL: "PARTIAL — it works, but there is a cost or complication",
    COMPLICATION: "COMPLICATION — it does not work; something new gets in the way",
  };

  const moveLine = result.move ? `\n  FAMILY MOVE — ${result.move.moveName}: ${result.move.note}` : "";

  // Said per check as well as once at the top of the narration prompt, because
  // the two do different jobs: the block up there says a plan exists, and this
  // says *this roll* was part of it — which is what stops a passage narrating
  // one girl's success as though she managed it on her own.
  const togetherLine = result.together
    ? `\n  TOGETHER — with ${result.together.with}: +${result.together.bonus}. This attempt` +
      ` was part of their shared plan; do not describe it as done alone.`
    : "";

  // Spelled out as an instruction rather than a fact, because the failure mode
  // is specific: told only the outcome, the storyteller writes a girl skilfully
  // pulling off the thing she actually fumbled. What happened is that the world
  // was kind — the branch held, the guard looked the other way — and that is a
  // different sentence entirely.
  const luckLine = result.luck
    ? `\n  LUCK — this was heading for ${result.luck.from} and fortune intervened. Narrate the` +
      ` *world* turning out kindly, not ${result.characterName} being clever or strong.`
    : "";

  return (
    `${result.characterName} attempts: ${result.intent}\n` +
    `  ${STAT_INFO[result.stat].label} check` +
    (result.skillName ? ` (using ${result.skillName})` : "") +
    ` vs ${result.difficulty} (${result.target})\n` +
    `  rolled ${result.roll}${bonusText} = ${result.total} → ${outcomeText[result.outcome]}` +
    togetherLine +
    luckLine +
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
