/**
 * The palette the character builder offers.
 *
 * Everything here is a suggestion, not a constraint — race and archetype are
 * free text in the database so a seven-year-old who wants to be a "Cloud
 * Baker" can be one. These lists exist to give people a starting point, and to
 * give the Game Master vocabulary it can lean on.
 */

import type { StatKey } from "./rules";

export type RaceOption = {
  value: string;
  blurb: string;
  /** A gentle nudge, shown in the builder. Nothing is enforced. */
  affinity: StatKey;
};

export const RACES: RaceOption[] = [
  { value: "Human", blurb: "Adaptable, stubborn, and fond of snacks.", affinity: "heart" },
  { value: "Elf", blurb: "Long-lived and quietly observant. Notices what others walk past.", affinity: "wits" },
  { value: "Dwarf", blurb: "Steady as a mountain and twice as hard to move.", affinity: "might" },
  { value: "Halfling", blurb: "Small, brave, and remarkably difficult to discourage.", affinity: "heart" },
  { value: "Fox-folk", blurb: "Bright-eyed and clever, with a tail that gives away their mood.", affinity: "wits" },
  { value: "Stonekin", blurb: "Born of hillside and hearth. Warm to the touch, slow to anger.", affinity: "might" },
  { value: "Sprite", blurb: "A handful of weather and mischief in a very small coat.", affinity: "spark" },
  { value: "Tidefolk", blurb: "At home in rivers and rain. Hums when thinking.", affinity: "spark" },
];

export type ArchetypeOption = {
  value: string;
  blurb: string;
  affinity: StatKey;
  /** Skills this calling suggests. Players may pick any skill regardless. */
  skills: string[];
};

export const ARCHETYPES: ArchetypeOption[] = [
  {
    value: "Guardian",
    blurb: "Stands in front. Not because they are fearless, but because someone has to.",
    affinity: "might",
    skills: ["Shield Others", "Hold Fast", "Carry the Load"],
  },
  {
    value: "Trickster",
    blurb: "Solves problems sideways. Rarely caught, occasionally sorry.",
    affinity: "wits",
    skills: ["Slip Away", "Quick Fingers", "Bright Idea"],
  },
  {
    value: "Healer",
    blurb: "Mends scrapes, feelings, and the occasional broken promise.",
    affinity: "heart",
    skills: ["Patch Up", "Calm the Frightened", "Know the Remedy"],
  },
  {
    value: "Scholar",
    blurb: "Has read about this. Probably. Give them a moment.",
    affinity: "wits",
    skills: ["Recall Lore", "Read the Signs", "Puzzle It Out"],
  },
  {
    value: "Beastfriend",
    blurb: "Speaks to animals, and — more impressively — listens to them.",
    affinity: "heart",
    skills: ["Speak with Animals", "Track and Follow", "Soothe the Wild"],
  },
  {
    value: "Maker",
    blurb: "Can fix it. Needs string, a bent nail, and ten minutes.",
    affinity: "wits",
    skills: ["Build and Mend", "Improvise", "Spot the Weak Point"],
  },
  {
    value: "Songkeeper",
    blurb: "Carries the family's stories, and knows which one is needed right now.",
    affinity: "spark",
    skills: ["Lift Spirits", "Remember the Tale", "Charm the Room"],
  },
  {
    value: "Wondersmith",
    blurb: "Magic, mostly on purpose.",
    affinity: "spark",
    skills: ["Small Wonders", "Sense the Unseen", "Mend by Moonlight"],
  },
];

/** Every skill any archetype suggests, de-duplicated and sorted. */
export const ALL_SKILLS: string[] = [
  ...new Set(ARCHETYPES.flatMap((archetype) => archetype.skills)),
].sort();

export const AGE_BANDS = [
  { value: "CHILD", label: "Child", blurb: "Small, quick, and underestimated." },
  { value: "TEEN", label: "Teen", blurb: "Capable, and knows it. Mostly." },
  { value: "GROWNUP", label: "Grown-up", blurb: "Steady hands, tired feet." },
  { value: "ELDER", label: "Elder", blurb: "Has seen this before. Has opinions." },
] as const;

/** Offered as buttons; the field accepts anything typed instead. */
export const PRONOUN_PRESETS = ["she/her", "he/him", "they/them"];

export function findArchetype(value: string): ArchetypeOption | undefined {
  return ARCHETYPES.find((archetype) => archetype.value === value);
}

export function findRace(value: string): RaceOption | undefined {
  return RACES.find((race) => race.value === value);
}
