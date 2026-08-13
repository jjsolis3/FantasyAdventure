/**
 * How long an adventure should take.
 *
 * Until now the storyteller decided when an act was finished with nothing to
 * go on: the extraction prompt showed it `"actComplete": false` and asked it to
 * judge. That is not a decision anybody can make well without knowing how long
 * the table wants to be here, so adventures ran however long the model felt
 * like, which is to say unpredictably.
 *
 * Pacing turns that into an informed choice by telling the storyteller two
 * concrete things: how many scenes this act has already run, and roughly how
 * many this family likes. It stays advice rather than a rule — an act that
 * reaches its natural end early should end, and one in the middle of something
 * should not be cut off on a count.
 *
 * Import-free so it can be used from the seed, the prompts and the browser.
 */

export const PACINGS = ["BRISK", "STANDARD", "LEISURELY"] as const;
export type PacingKey = (typeof PACINGS)[number];

export type PacingOption = {
  key: PacingKey;
  /** What the table would call it, not what the engine calls it. */
  label: string;
  blurb: string;
  /** Roughly how many scenes each of the three acts should run. */
  scenesPerAct: number;
};

export const PACING_OPTIONS: PacingOption[] = [
  {
    key: "BRISK",
    label: "One evening",
    blurb: "Moves quickly. Good for a school night, or a first adventure.",
    scenesPerAct: 2,
  },
  {
    key: "STANDARD",
    label: "A few sessions",
    blurb: "Room to explore, without it running away. A good default.",
    scenesPerAct: 4,
  },
  {
    key: "LEISURELY",
    label: "Take our time",
    blurb: "Long and unhurried. Side paths, quiet moments, holidays.",
    scenesPerAct: 7,
  },
];

export function pacingOption(key: string): PacingOption {
  return PACING_OPTIONS.find((option) => option.key === key) ?? PACING_OPTIONS[1];
}

/** Roughly how many scenes the whole adventure should run. */
export function totalScenesFor(key: string, actCount: number): number {
  return pacingOption(key).scenesPerAct * Math.max(actCount, 1);
}

/**
 * What to tell the storyteller about where it is.
 *
 * Phrased as a nudge in one direction or neither, rather than as a count to
 * obey. Handed a hard number, a model will end an act mid-sentence to hit it.
 */
export function pacingGuidance(options: {
  pacing: string;
  /** Scenes already played in the current act, including the one in progress. */
  sceneInAct: number;
  /** Zero-based. */
  actIndex: number;
  actCount: number;
}): string {
  const { scenesPerAct } = pacingOption(options.pacing);
  const act = `act ${options.actIndex + 1} of ${options.actCount}`;
  const position = `This is scene ${options.sceneInAct} of ${act}, and this family likes about ${scenesPerAct} scenes per act.`;

  if (options.sceneInAct < scenesPerAct) {
    return (
      `${position} There is room left — let things breathe, and only set ` +
      `"actComplete" if this act has genuinely reached its end.`
    );
  }

  if (options.sceneInAct >= scenesPerAct * 2) {
    // This used to read "look for an honest way to finish it soon", which was
    // an invitation to the one thing that ruins the game: handed a stuck party,
    // the cheapest honest-looking exit is to hand them the answer, and children
    // work that pattern out in about two evenings. An overrunning act is now a
    // reason to press harder, never a reason to solve it for them.
    return (
      `${position} This act has run well past that. Raise the pressure rather ` +
      `than the curtain: bring the deadline closer, make the cost of dithering ` +
      `visible, let the thing they are racing get ahead of them. Set ` +
      `"actComplete" when the act's goal is genuinely met — never merely ` +
      `because it has taken a while, and never by giving the party the answer.`
    );
  }

  return (
    `${position} It is a reasonable moment to be drawing this act toward its ` +
    `close. Set "actComplete" when the act's goal is met.`
  );
}
