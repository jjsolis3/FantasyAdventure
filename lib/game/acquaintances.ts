/**
 * People the family already knows.
 *
 * NPC memories have always been recorded, and have always died with the
 * campaign that made them. A family could spend four evenings winning over a
 * frightened beekeeper, finish the story, and begin the next one in a world
 * where nobody had ever met him.
 *
 * Which is the one thing a game about a family building a life together really
 * should not do. The reward for being kind to somebody ought to be that they
 * are still there.
 *
 * Two decisions do most of the work here.
 *
 * **Not everybody graduates.** An adventure remembers a dozen names, most of
 * them walk-ons — a stallholder, a voice through a door. If all of them
 * followed the party home, the list would be noise within two stories and the
 * storyteller would bring back the stallholder instead of the beekeeper. So
 * only the ones the story treated as mattering come along, and only a handful.
 *
 * **A reunion is offered, never required.** The storyteller is told who this
 * party knows and invited to use one if it fits. A chapter that bends itself
 * around an old acquaintance because the prompt insisted is worse than one that
 * never mentions them.
 */

/** What a remembered NPC looks like coming out of the campaign's memory. */
export type RememberedNpc = {
  key: string;
  content: string;
  importance: number;
};

/**
 * How memorable somebody has to have been to follow the party home.
 *
 * Importance defaults to 3, so this admits the middle of the range and above.
 * Set to 4 it would take only the unmistakable ones and miss the beekeeper who
 * mattered quietly; set to 2 it would take the stallholder.
 */
export const MEMORABLE_ENOUGH = 3;

/**
 * How many can come home from one adventure.
 *
 * Four. Enough that a story with a real cast keeps its cast, few enough that a
 * list read across a kitchen table stays a list of people rather than a census.
 */
export const MAX_PER_ADVENTURE = 4;

/**
 * The name folded into something that recognises the same person again.
 *
 * The storyteller will not spell them the same way twice across two adventures
 * — "the beekeeper", "Beekeeper", "the old beekeeper" — and three rows for one
 * person means he is a stranger every time.
 */
export function acquaintanceKey(name: string): string {
  // Tidied before the articles are stripped, not after. Anchored patterns do
  // not match past a leading space, so "  The Beekeeper" would otherwise keep
  // its "the" and become a second person.
  const tidy = name
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return tidy.replace(/^(the|a|an)\s+/u, "").replace(/^(old|young|little|big)\s+/u, "");
}

/**
 * Which of an adventure's remembered people come home with the party.
 *
 * Sorted by how much they mattered, capped, and de-duplicated on the folded
 * key so the same person recorded twice under two spellings arrives once.
 */
export function whoComesHome(remembered: RememberedNpc[]): RememberedNpc[] {
  const seen = new Set<string>();

  return remembered
    .filter((npc) => npc.importance >= MEMORABLE_ENOUGH && acquaintanceKey(npc.key).length > 1)
    .sort((a, b) => b.importance - a.importance || a.key.localeCompare(b.key))
    .filter((npc) => {
      const key = acquaintanceKey(npc.key);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PER_ADVENTURE);
}

export type KnownPerson = {
  name: string;
  about: string;
  metInCampaignTitle: string;
  timesMet: number;
  /** Which of the party know them, so the storyteller can be specific. */
  knownBy: string[];
};

/**
 * How many are put in front of the storyteller at once.
 *
 * A long list is a list nobody reads, and a model handed twelve old friends
 * will try to fit several of them into one chapter.
 */
export const MAX_OFFERED = 5;

/**
 * The block the storyteller is shown, or an empty string on a family's first
 * adventure — which is most of them, and should cost nothing.
 *
 * Written as an invitation with a ceiling. "You may" rather than "you must",
 * one per chapter, and never at the expense of the story that is actually
 * happening: a reunion that displaces the chapter is worse than no reunion.
 */
export function renderKnownPeople(people: KnownPerson[]): string {
  if (people.length === 0) return "";

  const lines = people.slice(0, MAX_OFFERED).map((person) => {
    const who = person.knownBy.length > 0 ? `${person.knownBy.join(" and ")} know` : "The party knows";
    const again =
      person.timesMet > 1
        ? ` They have turned up in ${person.timesMet} of this family's adventures now.`
        : "";

    return `- ${person.name}: ${person.about} ${who} them from ${person.metInCampaignTitle}.${again}`;
  });

  return (
    `PEOPLE THIS FAMILY ALREADY KNOWS. You may bring ONE of these back if this ` +
    `chapter has a natural place for them — and they must remember the party, by ` +
    `name, and refer to what happened between them. Do not bend the chapter to ` +
    `fit somebody in, do not use more than one, and do not mention them at all if ` +
    `there is no room: a reunion that displaces the story is worse than no ` +
    `reunion.\n${lines.join("\n")}`
  );
}

/** What the table is told when somebody they know comes home with them. */
export function metMessage(names: string[]): string {
  if (names.length === 0) return "";
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return `You will remember ${list} — and they will remember you.`;
}
