/**
 * Somebody who keeps turning up and is after the same thing they are.
 *
 * ## The line this whole file exists to hold
 *
 * The core contract forbids a villain: nobody is hurt, nothing catches them,
 * nobody is taken. That is not being relaxed. What it does not forbid is
 * somebody *infuriating* — who gets there first, takes the credit, is
 * unbearably pleased about it, and turns up three adventures later still going
 * on about it.
 *
 * That distinction has to be spelled out at length to the storyteller, because
 * "rival" and "nemesis" are words that invite a small local model to reach
 * straight for a monster. Half of `rivalNote` is therefore about what this
 * character may not be, and it is written before what they are.
 *
 * ## Once a chapter, and no oftener
 *
 * A rival in every scene is a co-star. The gate is a chapter rather than a
 * turn count — chapters are the rhythm a rivalry actually reads at, and it
 * means the storyteller can build to a meeting rather than being interrupted
 * by one. Enforced here, not asked for in the prompt, for the same reason as
 * everything else in this game that must be exact.
 */

export type RivalOutcome = "PARTY" | "RIVAL" | "NEITHER";

export const NAME_MAX = 60;
export const ABOUT_MAX = 200;
export const WANTS_MAX = 160;

export function isRivalOutcome(value: unknown): value is RivalOutcome {
  return value === "PARTY" || value === "RIVAL" || value === "NEITHER";
}

export type RivalSeen = {
  lastSeenCampaignId: string | null;
  lastSeenActIndex: number | null;
};

/**
 * Whether the rival may turn up in this chapter.
 *
 * A rival never seen is always allowed, so the first meeting can come early —
 * a nemesis nobody has met is just a row in a database.
 */
export function mayAppear(
  seen: RivalSeen,
  campaignId: string,
  actIndex: number,
): boolean {
  if (seen.lastSeenCampaignId === null || seen.lastSeenActIndex === null) return true;
  return seen.lastSeenCampaignId !== campaignId || seen.lastSeenActIndex !== actIndex;
}

/**
 * What the storyteller is told, and — at greater length — what it must not do.
 *
 * The forbidding comes first and takes more room than the character does. A 7B
 * model reads the top of a block far more reliably than the middle, and the top
 * is where "this person is not dangerous" has to live.
 */
export function rivalNote(rival: {
  name: string;
  about: string;
  wants: string;
  partyAhead: number;
  rivalAhead: number;
}): string {
  const score =
    rival.partyAhead === 0 && rival.rivalAhead === 0
      ? "They have never actually gone head to head yet."
      : `So far the party has got there first ${rival.partyAhead} ${
          rival.partyAhead === 1 ? "time" : "times"
        }, and ${rival.name} ${rival.rivalAhead} ${rival.rivalAhead === 1 ? "time" : "times"}.`;

  return [
    `SOMEBODY WHO KEEPS TURNING UP: ${rival.name}.`,
    "",
    `${rival.name} is NOT dangerous and is NOT frightening. They never threaten`,
    "anybody, never hurt anybody, and are never the thing a scene is scared of.",
    "Whatever else happens, the party is always safe in their company.",
    "",
    "What they are instead is infuriating. They get there first. They take the",
    "credit. They are unbearably pleased with themselves and they remember every",
    "previous time. Losing to them costs the party nothing but the satisfaction,",
    "and beating them is the best feeling in the game.",
    "",
    `${rival.about} What they are always after: ${rival.wants}`,
    score,
    "",
    "You may bring them into this chapter ONCE, if there is a natural place —",
    "and not at all if there is not. Do not bend the chapter to fit them in. When",
    "they do turn up they must remember the party by name and refer to what",
    "happened between them last time.",
  ].join("\n");
}

/** How the scoreboard reads on a screen. */
export function standings(partyAhead: number, rivalAhead: number, name: string): string {
  if (partyAhead === 0 && rivalAhead === 0) return `You and ${name} have yet to settle anything.`;
  if (partyAhead > rivalAhead) return `You are ahead of ${name}, ${partyAhead} to ${rivalAhead}.`;
  if (rivalAhead > partyAhead) return `${name} is ahead of you, ${rivalAhead} to ${partyAhead}.`;
  return `You and ${name} are level, ${partyAhead} apiece.`;
}

/** The instruction the extraction contract carries about meetings. */
export const RIVAL_INSTRUCTION =
  "rivalMet is for the person named above as somebody who keeps turning up, and " +
  "only when this passage actually put them in the scene. Say what happened and " +
  "who came off better: PARTY if the party got there first or got the better of " +
  "them, RIVAL if they did, NEITHER if it was a draw or they simply crossed " +
  "paths. Null on every turn they are not in, which is most turns.";
