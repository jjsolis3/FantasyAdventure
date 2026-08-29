/**
 * Two ways on, at the turning between chapters.
 *
 * ## What this is actually fixing
 *
 * The stories were good and they were never *theirs*. A chapter ended, the next
 * began, and the only thing anybody had chosen all evening was what their own
 * character did inside a scene somebody else had set. `whatNow` asks a question
 * at the end of every turn; nothing has ever branched on the answer.
 *
 * One choice per chapter is enough to change that, and it is deliberately at
 * the chapter boundary rather than every turn — a game that asks children to
 * pick a direction every three minutes is not offering agency, it is offering
 * admin.
 *
 * ## Why it blocks the next turn
 *
 * A fork nobody has to answer is a poll, and a poll is decoration. So the story
 * waits, exactly as it waits for a dice roll typed in from the table.
 *
 * The safety is in when a fork exists at all: only when the storyteller
 * actually named two ways. A passage that names none creates no row and the
 * adventure carries on as it always did, so the failure mode is the old
 * behaviour rather than a stuck campaign.
 */

export type ForkOption = {
  /** Where it leads, in a few words. */
  where: string;
  /** What draws them there. */
  why: string;
};

export type ForkChoice = "A" | "B";

export const WHERE_MAX = 80;
export const WHY_MAX = 160;

/** How the memory of a taken road is keyed, so the latest replaces the last. */
export const CHOSEN_ROAD_KEY = "the way they chose";

export function isForkChoice(value: unknown): value is ForkChoice {
  return value === "A" || value === "B";
}

/**
 * Whether a pair of options is worth putting in front of a family.
 *
 * Two ways that are the same way is the failure mode worth catching, and a
 * small local model produces it often — "go to the mill" and "head for the
 * mill" — because it is being asked for variety at the exact moment it has
 * least to go on. A fork like that is worse than none: it asks a child to
 * choose and then makes the choice meaningless.
 */
export function optionsUsable(a: ForkOption, b: ForkOption): boolean {
  const where = (value: string) => value.trim().toLowerCase();
  if (!where(a.where) || !where(b.where)) return false;
  if (!a.why.trim() || !b.why.trim()) return false;
  return where(a.where) !== where(b.where);
}

/** What the table is told the road they took was, for the next chapter. */
export function chosenRoadNote(option: ForkOption): string {
  return `The party chose to go to ${option.where.trim()} — ${option.why.trim()}`;
}

/**
 * What the storyteller is asked for when a chapter is ending.
 *
 * Only ever at a chapter's close. Asked for on every turn it would be two more
 * fields for a small model to fill with noise on the ninety-nine turns out of a
 * hundred that end nothing.
 */
export const FORK_INSTRUCTION =
  "waysOn is for the moment a chapter ENDS, and only then. When actComplete is " +
  "true, give exactly two places the story could go next — genuinely different " +
  "ones, not the same place worded twice. Each is somewhere they could go and " +
  "one line on what draws them to it. When actComplete is false, [].";
