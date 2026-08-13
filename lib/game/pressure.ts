/**
 * The clock that answers "what happens if we just mess about?"
 *
 * ## The problem this solves
 *
 * Nothing was ever refused. An action that had nothing to do with the story got
 * narrated as warmly as one that cracked it open, and the game's only reaction
 * to a table going in circles was more pleasant prose. Two things followed, and
 * the second is the dangerous one:
 *
 * 1. An evening could be spent going nowhere with no signal that it was
 *    happening. Pacing counts *scenes*, and a scene only ends when the party
 *    moves — so ten turns in one kitchen is still scene one.
 * 2. Worse, when an act overran, the storyteller was told to "look for an
 *    honest way to finish it soon". Handed a stuck party, the cheapest
 *    honest-looking way out is to hand them the answer. Children work that
 *    pattern out in about two evenings, and once they have, there is no reason
 *    left to think about anything.
 *
 * ## The approach
 *
 * The game already believes something useful: *a failed roll never stops the
 * story, it complicates it.* This extends that from a failed **roll** to an
 * unfocused **idea**. An off-target turn does not fail and is never refused —
 * it **costs**. The fog comes in a little further.
 *
 * That distinction is the whole design, and it is worth being exact about:
 *
 * - She tried the right thing and the dice said no → **nothing ticks.** She
 *   engaged; the complication is already her cost, and charging her twice for
 *   one bad roll is how a game teaches a child not to try.
 * - She did something that was not really anything → **the clock moves.**
 *
 * ## Why it is shown
 *
 * In the story's own words — the fog, the stars going out, the festival getting
 * closer — on the play page and on the television. A hidden clock teaches
 * nothing. A visible one teaches the lesson without anybody explaining a rule:
 * you did that, and the fog came closer, and when you had a real idea it did
 * not.
 *
 * ## What it never does
 *
 * End an adventure. When it fills, the thing they were trying to prevent
 * partly happens and the story goes on, harder — the festival starts without
 * the cake. Same shape as every other setback in this game.
 */

import { pacingOption } from "@/lib/game/pacing";

/**
 * How far the clock runs in one act, given how long this family likes an act.
 *
 * Tied to pacing because a fixed number would mean something different in each:
 * a clock of six would fill twice over in a brisk act and never fill at all in
 * a leisurely one. Two spare above the scene count, so a table can have a
 * couple of wandering turns per scene — which is most of the fun — before the
 * story starts pushing back.
 */
export function pressureLimit(pacing: string): number {
  return pacingOption(pacing).scenesPerAct + 2;
}

/** What the clock is called when a storyline has not named its own. */
export const DEFAULT_PRESSURE_NAME = "The clock";

/**
 * What happened on one turn, reduced to the only question the clock asks.
 *
 * Deliberately built from things already computed for other reasons rather than
 * from a new judgement: every field here was needed anyway, which is why this
 * whole mechanic costs one extra model field and no extra model calls.
 */
export type TurnShape = {
  /** Outcomes of every check rolled this turn, in order. */
  outcomes: string[];
  /** Objectives the passage showed finished. */
  deedsDone: number;
  /** Things now in somebody's pocket. */
  itemsGained: number;
  /** New errands the passage opened. */
  questsOpened: number;
  sceneComplete: boolean;
  actComplete: boolean;
  /**
   * The storyteller's own answer to "did they get anywhere?".
   *
   * A second opinion, never the first. It exists because the hard signals miss
   * the most valuable kind of turn there is: a girl asking an innkeeper who else
   * was at the fair finishes no objective and picks up no object, and is exactly
   * the thinking this whole feature is meant to protect.
   */
  storytellerSaysMoved: boolean;
};

/**
 * Whether this turn actually got anywhere.
 *
 * Hard signals first. Anything that changed the board — a check that landed, an
 * objective finished, something picked up, an errand started, a scene or an act
 * ending — is progress and the model does not get a vote on it.
 */
export function movedForward(turn: TurnShape): boolean {
  if (turn.outcomes.some((outcome) => outcome === "SUCCESS" || outcome === "CRITICAL")) return true;
  if (turn.deedsDone > 0 || turn.itemsGained > 0 || turn.questsOpened > 0) return true;
  if (turn.sceneComplete || turn.actComplete) return true;
  return turn.storytellerSaysMoved;
}

/**
 * Whether the clock moves.
 *
 * Three conditions, and the middle one is the one that makes this fair rather
 * than punishing:
 *
 * 1. The turn got nowhere — by the hard signals *and* by the storyteller's
 *    reading of its own passage. Both must agree. Erring toward not ticking is
 *    deliberate: an unfair tick is felt immediately by a child and a missed one
 *    is invisible.
 * 2. Nobody rolled anything. A roll means somebody committed to an attempt the
 *    game thought could fail, which is engagement whatever the die said.
 * 3. There is an act still running for it to matter in.
 */
export function shouldTick(turn: TurnShape): boolean {
  if (movedForward(turn)) return false;
  if (turn.outcomes.length > 0) return false;
  return true;
}

export type PressureState = {
  /** How far along, never above the limit. */
  level: number;
  limit: number;
  /**
   * The clock is full and this turn is the one that pays for it.
   *
   * A full clock is a debt rather than an event, which is what makes the
   * ordering work. A turn is narrated *before* anything can be extracted from
   * it, so the turn that fills the clock cannot also show the consequence —
   * the passage was written before the game knew. So filling it only marks it
   * owed, and the next passage collects: the fog wins as the page turns, which
   * is where a table would expect it anyway.
   */
  owed: boolean;
};

/** Where the clock stands at the top of a turn. */
export function pressureAt(level: number, limit: number): PressureState {
  const clamped = Math.max(0, Math.min(level, limit));
  return { level: clamped, limit, owed: clamped >= limit };
}

/**
 * Where the clock stands at the end of one, given how the turn went.
 *
 * A debt just paid resets to nothing — one filling buys exactly one
 * consequence, and a party that has just watched the fog take the last street
 * should not find it taking the next one immediately.
 */
export function advance(state: PressureState, tick: boolean): number {
  if (state.owed) return 0;
  return Math.min(state.level + (tick ? 1 : 0), state.limit);
}

/**
 * What the storyteller is told about the clock, or nothing at all.
 *
 * Three states, and each one is an instruction rather than a status, because a
 * model handed a number will either ignore it or panic. The middle state is the
 * one that replaces the old "find an honest way to finish this soon" — the line
 * that used to invite the giveaway.
 */
export function pressureGuidance(options: {
  name: string;
  level: number;
  limit: number;
  owed: boolean;
}): string {
  const { name, level, limit } = options;

  if (options.owed) {
    return (
      `${name.toUpperCase()} — IT HAS RUN OUT.\n` +
      `What the party was trying to prevent now partly happens. Show it landing in this ` +
      `passage: something is lost, changed, or made harder. Nobody is hurt and the adventure ` +
      `is not over — the story carries on from a worse position. Do not announce a rule and ` +
      `do not scold anybody; just tell them what ${name} did while they were not looking.`
    );
  }

  if (level === 0) return "";

  const close = level >= limit - 1;
  return (
    `${name.toUpperCase()} — ${level} of ${limit}.\n` +
    `The party has spent turns not getting anywhere, and ${name} has moved that far because ` +
    `of it. Show it in this passage: closer, louder, later, worse — one concrete detail, not ` +
    `a warning.` +
    (close ? ` It is nearly out of room.` : "") +
    `\nDo NOT solve their problem for them because they are stuck. You may give them a new ` +
    `way to look — a sound, a smell, somebody who knows something, a door they have not ` +
    `tried. Never the answer itself.`
  );
}
