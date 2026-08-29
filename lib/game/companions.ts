/**
 * Something small that comes along.
 *
 * ## The two wrong answers this exists instead of
 *
 * `PET` has been a relationship kind since ties were built, but ties run
 * between two `Character` rows — so having a wooden owl meant building the owl
 * in the seven-stat character builder, with a race, a calling and a spread of
 * numbers. Nobody was ever going to do that, which is exactly why nobody had
 * one. The feature existed and was unreachable.
 *
 * The other wrong answer is an inventory item, which the engine already refuses
 * in as many words: *"a companion is not an `InventoryItem` and never will
 * be"*. Putting a living thing on the same list as a length of rope is how a
 * game teaches a child that their friend is equipment.
 *
 * ## It never touches the dice
 *
 * A companion's knack is honoured in the *telling*: a storyteller told that
 * Woody can see in the dark will let Woody see in the dark. It adds nothing to
 * any roll, deliberately — a companion that made checks easier would become a
 * thing you optimise, and every child would end up with the same one.
 *
 * ## Closeness is a number, not a stat
 *
 * It counts chapters travelled together and buys nothing at all. That is the
 * point: it says *this has been going on a while*, which is the whole of what a
 * child wants from it. The moment it grants a bonus it stops being a friendship
 * and starts being a level.
 */

export const NAME_MAX = 40;
export const KIND_MAX = 60;
export const KNACK_MAX = 80;

export type CompanionLike = {
  name: string;
  kind: string;
  knack: string;
  closeness: number;
};

export type CompanionSeen = {
  countedCampaignId: string | null;
  countedActIndex: number | null;
};

/**
 * Whether this chapter has already been counted toward closeness.
 *
 * Chapters rather than turns, so a long chapter and a short one are worth the
 * same. Closeness is a measure of how much story they have been through
 * together, and a table that plays sixteen turns in one sitting has not had
 * more of a friendship than one that played four.
 */
export function countsTowardCloseness(
  seen: CompanionSeen,
  campaignId: string,
  actIndex: number,
): boolean {
  if (seen.countedCampaignId === null || seen.countedActIndex === null) return true;
  return seen.countedCampaignId !== campaignId || seen.countedActIndex !== actIndex;
}

/** How the sheet says how long they have been at this. */
export function closenessNote(companion: CompanionLike): string {
  if (companion.closeness === 0) return `${companion.name} has only just started coming along.`;
  if (companion.closeness === 1) return `${companion.name} has been through one chapter with them.`;
  return `${companion.name} has been through ${companion.closeness} chapters with them.`;
}

/**
 * What the storyteller is told about the small things travelling with them.
 *
 * The safety line is first and is stronger than the party's own, because a
 * companion is precisely what a storyteller reaches for when it wants stakes
 * without hurting a child's character. Nothing happens to it. That has to be
 * said before anything else, or a model looking for tension will find it here.
 */
export function companionNote(
  companions: { owner: string; name: string; kind: string; knack: string }[],
): string {
  if (companions.length === 0) return "";

  return [
    "SMALL THINGS TRAVELLING WITH THEM:",
    ...companions.map(
      (c) => `- ${c.name}, ${c.kind}, with ${c.owner}. What they are good at: ${c.knack}`,
    ),
    "",
    "NOTHING HAPPENS TO THESE. They are never hurt, never taken, never lost,",
    "never left behind, and never the thing at stake in a scene. Do not threaten",
    "one to raise the tension — that is the one cheap trick this game does not",
    "have. A child who thinks their companion might not come home has stopped",
    "enjoying the story.",
    "",
    "Otherwise use them properly: they are present, they have opinions, and what",
    "they are good at is true. Let them notice things, be in the way, and get the",
    "occasional line of their own. They never solve the problem for the party.",
  ].join("\n");
}

/** The instruction the extraction contract carries about finding one. */
export const COMPANION_INSTRUCTION =
  "companionFound is for the rare passage where somebody in the party gains a " +
  "small creature or made thing that will travel with them from now on — tamed, " +
  "befriended, given, or woken up. Only when the passage really shows it joining " +
  "them for good, and only for a character who does not already have one. Null on " +
  "almost every turn.";
