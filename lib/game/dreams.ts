/**
 * The one thing an adventurer wants that no single adventure can give her.
 *
 * ## The two rules that make this work
 *
 * **The storyteller may never answer one.** Only the family does. A model that
 * resolves a dream in turn three has spent the thing that was making next
 * Saturday worth turning up to, and there is no getting it back. Nothing in the
 * extraction contract can set a dream to ANSWERED; the only route is a person
 * pressing a button and saying how it happened.
 *
 * **The world may only whisper about it rarely.** This is the harder half, and
 * it is not left to the model. The codebase already learned this once, on
 * personal aims: *"an aim the world keeps offering is an aim nobody achieved"*.
 * A dream mentioned every turn is not a long ambition, it is a running joke —
 * and a small local model handed "mention this occasionally" will mention it
 * constantly, because every turn looks like a fresh chance to be helpful.
 *
 * So the model proposes and the server disposes. `mayEcho` is the gate, and it
 * counts turns rather than trusting an instruction. Same principle as the
 * pressure clock and the difficulty dial: anything that must be exact is a
 * number here, not a sentence there.
 */

/**
 * Turns that must pass between one whisper and the next.
 *
 * Six is about two scenes at BRISK pacing — often enough that a child sees the
 * world has not forgotten, rare enough that each one is an event. Deliberately
 * counted per dream rather than per party: two sisters with two dreams should
 * each get their own, not take turns.
 */
export const ECHO_COOLDOWN_TURNS = 6;

/** The most a single turn may record, however many the model proposes. */
export const ECHO_LIMIT_PER_TURN = 2;

/** One dream at a time. Two ambitions is a to-do list. */
export const DREAMS_AT_ONCE = 1;

export const WISH_MAX = 160;

export type DreamLike = {
  characterName: string;
  wish: string;
  /** The turn its last echo landed on, or null when the world has never spoken. */
  lastEchoTurn: number | null;
};

/**
 * Whether the world is allowed to brush against this dream now.
 *
 * A dream that has never been touched is always allowed, which is what makes
 * the first whisper arrive early — a child who writes an ambition and hears
 * nothing for a month has learned the box was decorative.
 */
export function mayEcho(lastEchoTurn: number | null, currentTurn: number): boolean {
  if (lastEchoTurn === null) return true;
  return currentTurn - lastEchoTurn >= ECHO_COOLDOWN_TURNS;
}

/**
 * What the storyteller is told, and what it is forbidden from doing.
 *
 * Only the dreams it is currently allowed to touch are listed. A dream on
 * cooldown is not mentioned at all rather than mentioned with a "not yet" —
 * telling a small model about something it must not use is the reliable way to
 * get it used.
 */
export function dreamNote(dreams: DreamLike[]): string {
  if (dreams.length === 0) return "";

  return [
    "WHAT THEY HAVE ALWAYS WANTED. One long wish each, older than this adventure.",
    "You may brush against ONE of these, at most, in this passage — a rumour, a",
    "half-answer, somebody who once knew, a thing that looks like it might be",
    "connected. Most passages should touch none of them.",
    "",
    "You may NEVER answer one, and never let a character say theirs aloud. These",
    "end when the family says they end, not when the story is convenient. Getting",
    "somebody close and then giving it to them is the one thing that ruins this.",
    ...dreams.map((dream) => `- ${dream.characterName}: ${dream.wish}`),
  ].join("\n");
}

/**
 * How the sheet says what the world has done about it so far.
 *
 * Counted rather than listed here; the echoes themselves are worth reading and
 * get their own space. This is the line under the wish.
 */
export function echoSummary(count: number): string {
  if (count === 0) return "The world has not said anything about this yet.";
  if (count === 1) return "Once, the world has said something about this.";
  return `${count} times now, the world has said something about this.`;
}
