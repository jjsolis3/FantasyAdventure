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
  /**
   * The one thing this calling alone can do.
   *
   * Archetype used to be decoration: it suggested three skills in the builder,
   * appeared in the prompt, and granted nothing. Two Guardians and a Trickster
   * played identically once the dice were rolling.
   *
   * A signature is spendable once a scene, needs no bond and no partner — which
   * is what makes it *hers* rather than something the party does. Told to the
   * storyteller so it narrates properly, and applied to the dice so it is real
   * rather than flavour.
   */
  signature: {
    name: string;
    /** Shown to the player. */
    blurb: string;
    /** Told to the Game Master, so the moment reads as the calling's own. */
    narrationHint: string;
  };
};

export const ARCHETYPES: ArchetypeOption[] = [
  {
    value: "Guardian",
    blurb: "Stands in front. Not because they are fearless, but because someone has to.",
    affinity: "might",
    skills: ["Shield Others", "Hold Fast", "Carry the Load"],
    signature: {
      name: "Step In",
      blurb: "Take a roll somebody else just failed, and make it yours instead.",
      narrationHint:
        "The Guardian gets between the danger and whoever it was aimed at, and takes the weight of it themselves.",
    },
  },
  {
    value: "Trickster",
    blurb: "Solves problems sideways. Rarely caught, occasionally sorry.",
    affinity: "wits",
    skills: ["Slip Away", "Quick Fingers", "Bright Idea"],
    signature: {
      name: "Another Way",
      blurb: "Ask the storyteller for a second way in. There is always one.",
      narrationHint:
        "The Trickster spots the thing nobody was looking at — a loose board, an unlatched window, a bored guard.",
    },
  },
  {
    value: "Healer",
    blurb: "Mends scrapes, feelings, and the occasional broken promise.",
    affinity: "heart",
    skills: ["Patch Up", "Calm the Frightened", "Know the Remedy"],
    signature: {
      name: "Steady Now",
      blurb: "Undo a complication that just happened to somebody. It turns out to be less bad than it looked.",
      narrationHint:
        "The Healer is there before anyone has finished falling, and what looked ruinous turns out to be mendable.",
    },
  },
  {
    value: "Scholar",
    blurb: "Has read about this. Probably. Give them a moment.",
    affinity: "wits",
    skills: ["Recall Lore", "Read the Signs", "Puzzle It Out"],
    signature: {
      name: "I Have Read About This",
      blurb: "Ask the storyteller one true thing about anything in the scene. It must answer.",
      narrationHint:
        "The Scholar remembers a page from somewhere and it turns out to be exactly the right page.",
    },
  },
  {
    value: "Beastfriend",
    blurb: "Speaks to animals, and — more impressively — listens to them.",
    affinity: "heart",
    skills: ["Speak with Animals", "Track and Follow", "Soothe the Wild"],
    signature: {
      name: "Ask an Animal",
      blurb: "Any creature nearby will tell you one thing it has seen.",
      narrationHint:
        "The Beastfriend asks, plainly and politely, and something small and watchful answers.",
    },
  },
  {
    value: "Maker",
    blurb: "Can fix it. Needs string, a bent nail, and ten minutes.",
    affinity: "wits",
    skills: ["Build and Mend", "Improvise", "Spot the Weak Point"],
    signature: {
      name: "Give Me a Minute",
      blurb: "Make the thing the party needs right now out of what is already in your pockets.",
      narrationHint:
        "The Maker crouches down with string and a bent nail and stands up holding exactly what was needed.",
    },
  },
  {
    value: "Songkeeper",
    blurb: "Carries the family's stories, and knows which one is needed right now.",
    affinity: "spark",
    skills: ["Lift Spirits", "Remember the Tale", "Charm the Room"],
    signature: {
      name: "The Right Song",
      blurb: "Everyone else's next roll gets +2. You cannot use it on your own.",
      narrationHint:
        "The Songkeeper starts singing, and everybody stands a little straighter without deciding to.",
    },
  },
  {
    value: "Wondersmith",
    blurb: "Magic, mostly on purpose.",
    affinity: "spark",
    skills: ["Small Wonders", "Sense the Unseen", "Mend by Moonlight"],
    signature: {
      name: "A Small Wonder",
      blurb: "Something impossible happens, briefly and on a small scale. You choose what.",
      narrationHint:
        "The Wondersmith does something that should not work, and for a moment it does.",
    },
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

/**
 * The signature of a calling, if it is one we know.
 *
 * Free text means a great many callings are not — the Cloud Baker has none, and
 * that is fine. Nobody is worse off than they were: a signature is something
 * eight callings gained, not something anybody lost.
 */
export function signatureFor(archetype: string): ArchetypeOption["signature"] | undefined {
  return ARCHETYPES.find(
    (option) => option.value.toLocaleLowerCase() === archetype.trim().toLocaleLowerCase(),
  )?.signature;
}

export function findArchetype(value: string): ArchetypeOption | undefined {
  return ARCHETYPES.find((archetype) => archetype.value === value);
}

export function findRace(value: string): RaceOption | undefined {
  return RACES.find((race) => race.value === value);
}
