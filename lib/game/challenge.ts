/**
 * How hard the dice are.
 *
 * ## Why this is a number and not a sentence
 *
 * The obvious way to build a difficulty setting is to tell the storyteller to
 * be harder on them. Three reasons not to:
 *
 *   - The Game Master runs on a small local model, and "be harder" is exactly
 *     the kind of vague instruction it follows inconsistently — some turns
 *     brutal, some turns unchanged, and no way to tell which you are getting.
 *   - The adjudicator is under a standing order not to invent difficulty, put
 *     there after it turned "I go back to the table" into "quietly, unseen" and
 *     failed a girl at something she never tried. A dial telling it to be
 *     tougher argues with that order every turn.
 *   - The check preview shows the target number before the dice are thrown. A
 *     setting that moves that number is one a child can see working; a setting
 *     that changes the model's mood is one nobody can see at all.
 *
 * So the model still decides which band a check falls in — EASY for
 * simple-but-uncertain, HARD for a long shot, which is a judgement about the
 * *scene* and belongs to it — and this decides what those bands cost.
 *
 * ## Two knobs, because they feel different
 *
 * Lowering the bar and softening the miss are not the same experience, and for
 * a nine-year-old the second matters more. The near-miss window is what turns a
 * bad roll into "it works, but…" instead of a flat failure, so widening it
 * keeps the tension while taking the sting out. Both move together here, in the
 * same direction, so one setting means one thing.
 */

export type ChallengeKey = "GENTLE" | "BALANCED" | "TOUGH";

export type Difficulty = "EASY" | "NORMAL" | "HARD";

type Band = Record<Difficulty, number>;

/**
 * What each band needs, per setting.
 *
 * BALANCED is the ladder the game shipped with and must stay exactly where it
 * is: every adventure in flight defaults to it, and moving it would retune
 * every table that never asked for anything.
 */
const TARGETS: Record<ChallengeKey, Band> = {
  GENTLE: { EASY: 6, NORMAL: 10, HARD: 14 },
  BALANCED: { EASY: 8, NORMAL: 12, HARD: 16 },
  TOUGH: { EASY: 10, NORMAL: 14, HARD: 18 },
};

/**
 * How far under the target still counts as "it works, but there is a cost".
 *
 * Missing by more than this is a COMPLICATION — which is never nothing
 * happening, but is the harder of the two answers to hear.
 */
const NEAR_MISS: Record<ChallengeKey, number> = {
  GENTLE: 4,
  BALANCED: 2,
  TOUGH: 1,
};

/** Falls back to the middle for anything unrecognised, never to a harder one. */
function settingOf(challenge: string | undefined): ChallengeKey {
  return challenge === "GENTLE" || challenge === "TOUGH" ? challenge : "BALANCED";
}

export function targetFor(difficulty: Difficulty, challenge?: string): number {
  return TARGETS[settingOf(challenge)][difficulty];
}

export function nearMissFor(challenge?: string): number {
  return NEAR_MISS[settingOf(challenge)];
}

export type ChallengeOption = {
  value: ChallengeKey;
  label: string;
  /** What it does, in numbers, because a vague promise helps nobody choose. */
  blurb: string;
};

export const CHALLENGE_OPTIONS: ChallengeOption[] = [
  {
    value: "GENTLE",
    label: "Gentle",
    blurb:
      "Lower bars, and a near miss still works out. Good for younger adventurers, " +
      "or an evening where the story matters more than the dice.",
  },
  {
    value: "BALANCED",
    label: "Just right",
    blurb: "The usual. Rolls are genuinely uncertain and a bad one costs something.",
  },
  {
    value: "TOUGH",
    label: "Tough",
    blurb:
      "Every bar two points higher, and only the narrowest miss is forgiven. " +
      "For a table that wants to earn it.",
  },
];

export const CHALLENGE_LABELS: Record<string, string> = Object.fromEntries(
  CHALLENGE_OPTIONS.map((option) => [option.value, option.label]),
);
