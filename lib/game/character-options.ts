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
  { value: "Elf", blurb: "Long-lived and quietly observant. Notices what others walk past.", affinity: "grace" },
  { value: "Dwarf", blurb: "Steady as a mountain and twice as hard to move.", affinity: "grit" },
  { value: "Halfling", blurb: "Small, brave, and remarkably difficult to discourage.", affinity: "luck" },
  { value: "Fox-folk", blurb: "Bright-eyed and clever, with a tail that gives away their mood.", affinity: "wits" },
  { value: "Stonekin", blurb: "Born of hillside and hearth. Warm to the touch, slow to anger.", affinity: "might" },
  { value: "Sprite", blurb: "A handful of weather and mischief in a very small coat.", affinity: "grace" },
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
  signatures: Signature[];
};

export type Signature = {
  name: string;
  /** Shown to the player. */
  blurb: string;
  /** Told to the Game Master, so the moment reads as the calling's own. */
  narrationHint: string;
  /**
   * The level it arrives at.
   *
   * One from the start, and a second at five. A calling used to be finished the
   * moment it was picked — a Guardian had Step In and always would, so the most
   * characterful thing on the sheet was also the only one that never changed.
   * Five is far enough to be worth waiting for and near enough to be believed.
   */
  fromLevel: number;
  /**
   * What it does to the dice, if anything.
   *
   * Most signatures are `NARRATIVE`: the effect is that the story behaves
   * differently, which is the right shape for "ask the storyteller one true
   * thing" and could not be a modifier. The ones that *are* numbers were already
   * written as numbers in the blurb a child reads — the Songkeeper's is
   * literally "+2" — and those had better be the number the engine uses.
   */
  effect: SignatureEffect;
};

/**
 * What spending a signature does mechanically.
 *
 * Three kinds, matching the three kinds of promise the blurbs make. Anything
 * that cannot be one of these is `NARRATIVE`, which is not a cop-out: a
 * storyteller told plainly that it must answer is a stronger guarantee than a
 * modifier, and it is the only shape that fits "something impossible happens,
 * briefly and on a small scale".
 */
export type SignatureEffect =
  /** Her roll this turn simply works. No dice, no complication. */
  | { kind: "AUTO_SUCCEED" }
  /** Everybody else's roll this turn is better by this much. Never her own. */
  | { kind: "BOOST_OTHERS"; amount: number }
  /** The storyteller is told, and must honour it. */
  | { kind: "NARRATIVE" };

export const ARCHETYPES: ArchetypeOption[] = [
  {
    value: "Guardian",
    blurb: "Stands in front. Not because they are fearless, but because someone has to.",
    affinity: "might",
    skills: ["Shield Others", "Hold Fast", "Carry the Load"],
    signatures: [
      {
        name: "Step In",
        blurb: "Take a roll somebody else just failed, and make it yours instead.",
        narrationHint:
          "The Guardian gets between the danger and whoever it was aimed at, and takes the weight of it themselves.",
        effect: { kind: "AUTO_SUCCEED" },
        fromLevel: 1,
      },
      {
        name: "Hold the Line",
        blurb:
          "Nothing gets past you this scene. Say what you are guarding, and it stays guarded.",
        narrationHint:
          "The Guardian plants themselves, and for the rest of the scene whatever they said they were protecting simply is not reached. Do not roll for it.",
        fromLevel: 5,
        effect: { kind: "NARRATIVE" },
      },
    ],
  },
  {
    value: "Trickster",
    blurb: "Solves problems sideways. Rarely caught, occasionally sorry.",
    affinity: "grace",
    skills: ["Slip Away", "Quick Fingers", "Bright Idea"],
    signatures: [
      {
        name: "Another Way",
        blurb: "Ask the storyteller for a second way in. There is always one.",
        narrationHint:
          "The Trickster spots the thing nobody was looking at — a loose board, an unlatched window, a bored guard.",
        effect: { kind: "NARRATIVE" },
        fromLevel: 1,
      },
      {
        name: "Never Where You Looked",
        blurb:
          "You were somewhere else all along. Undo something that just happened to you.",
        narrationHint:
          "The Trickster turns out not to have been where everyone assumed — the thing that caught them caught a coat, a shadow, a very convincing pile of leaves.",
        fromLevel: 5,
        effect: { kind: "NARRATIVE" },
      },
    ],
  },
  {
    value: "Healer",
    blurb: "Mends scrapes, feelings, and the occasional broken promise.",
    affinity: "heart",
    skills: ["Patch Up", "Calm the Frightened", "Know the Remedy"],
    signatures: [
      {
        name: "Steady Now",
        blurb: "Undo a complication that just happened to somebody. It turns out to be less bad than it looked.",
        narrationHint:
          "The Healer is there before anyone has finished falling, and what looked ruinous turns out to be mendable.",
        effect: { kind: "NARRATIVE" },
        fromLevel: 1,
      },
      {
        name: "Everyone Breathes",
        blurb:
          "The whole party's next roll goes better. Yours too, this once.",
        narrationHint:
          "The Healer says something quiet and unremarkable, and the whole party settles — everybody stands a little steadier for what comes next.",
        fromLevel: 5,
        effect: { kind: "BOOST_OTHERS", amount: 2 },
      },
    ],
  },
  {
    value: "Scholar",
    blurb: "Has read about this. Probably. Give them a moment.",
    affinity: "wits",
    skills: ["Recall Lore", "Read the Signs", "Puzzle It Out"],
    signatures: [
      {
        name: "I Have Read About This",
        blurb: "Ask the storyteller one true thing about anything in the scene. It must answer.",
        narrationHint:
          "The Scholar remembers a page from somewhere and it turns out to be exactly the right page.",
        effect: { kind: "NARRATIVE" },
        fromLevel: 1,
      },
      {
        name: "The Book Was Right",
        blurb:
          "Name what you think is about to happen. You are correct.",
        narrationHint:
          "The Scholar says what happens next before it does, and is right — arrange the scene so the prediction turns out to have been sound.",
        fromLevel: 5,
        effect: { kind: "NARRATIVE" },
      },
    ],
  },
  {
    value: "Beastfriend",
    blurb: "Speaks to animals, and — more impressively — listens to them.",
    affinity: "luck",
    skills: ["Speak with Animals", "Track and Follow", "Soothe the Wild"],
    signatures: [
      {
        name: "Ask an Animal",
        blurb: "Any creature nearby will tell you one thing it has seen.",
        narrationHint:
          "The Beastfriend asks, plainly and politely, and something small and watchful answers.",
        effect: { kind: "NARRATIVE" },
        fromLevel: 1,
      },
      {
        name: "They Come When Called",
        blurb:
          "Every animal within earshot arrives, and helps.",
        narrationHint:
          "The Beastfriend calls, and the birds, the mice, the neighbour’s enormous cat all turn up at once and do something useful and slightly chaotic.",
        fromLevel: 5,
        effect: { kind: "NARRATIVE" },
      },
    ],
  },
  {
    value: "Maker",
    blurb: "Can fix it. Needs string, a bent nail, and ten minutes.",
    affinity: "wits",
    skills: ["Build and Mend", "Improvise", "Spot the Weak Point"],
    signatures: [
      {
        name: "Give Me a Minute",
        blurb: "Make the thing the party needs right now out of what is already in your pockets.",
        narrationHint:
          "The Maker crouches down with string and a bent nail and stands up holding exactly what was needed.",
        effect: { kind: "AUTO_SUCCEED" },
        fromLevel: 1,
      },
      {
        name: "It Was Built For This",
        blurb:
          "Something you made earlier turns out to be exactly right. It simply works.",
        narrationHint:
          "The Maker produces a thing they built pages ago and it fits the problem perfectly, as though they had known. No roll.",
        fromLevel: 5,
        effect: { kind: "AUTO_SUCCEED" },
      },
    ],
  },
  {
    value: "Songkeeper",
    blurb: "Carries the family's stories, and knows which one is needed right now.",
    affinity: "spark",
    skills: ["Lift Spirits", "Remember the Tale", "Charm the Room"],
    signatures: [
      {
        name: "The Right Song",
        blurb: "Everyone else's next roll gets +2. You cannot use it on your own.",
        narrationHint:
          "The Songkeeper starts singing, and everybody stands a little straighter without deciding to.",
        effect: { kind: "BOOST_OTHERS", amount: 2 },
        fromLevel: 1,
      },
      {
        name: "The One About Us",
        blurb:
          "Tell the story of what this family has already done. Everyone else goes again, better.",
        narrationHint:
          "The Songkeeper tells the party’s own story back to them, and everybody finds they can try once more with more in them than before.",
        fromLevel: 5,
        effect: { kind: "BOOST_OTHERS", amount: 3 },
      },
    ],
  },
  {
    value: "Wondersmith",
    blurb: "Magic, mostly on purpose.",
    affinity: "spark",
    skills: ["Small Wonders", "Sense the Unseen", "Mend by Moonlight"],
    signatures: [
      {
        name: "A Small Wonder",
        blurb: "Something impossible happens, briefly and on a small scale. You choose what.",
        narrationHint:
          "The Wondersmith does something that should not work, and for a moment it does.",
        effect: { kind: "NARRATIVE" },
        fromLevel: 1,
      },
      {
        name: "A Bigger Wonder",
        blurb:
          "Something impossible happens, and this time it is not small.",
        narrationHint:
          "The Wondersmith does something that genuinely should not be possible — a room turns inside out, a river runs uphill for a minute — and it holds.",
        fromLevel: 5,
        effect: { kind: "NARRATIVE" },
      },
    ],
  },
];

/**
 * Skills nobody's calling owns.
 *
 * The twenty-four above belong to the eight callings, three each, and they are
 * what gets *suggested*. For a long time they were also the entire list, which
 * made the builder's skill step a choice between three things and a shrug — and
 * meant a girl who wanted her adventurer to be good at swimming, or at drawing,
 * simply could not have it.
 *
 * These are the ordinary competences of a person in a story: things a child
 * recognises from her own life, and things she has watched somebody do. Grouped
 * so the full list can be browsed rather than scrolled — a wall of forty-eight
 * names in one column is a wall, however good the names are.
 */
export const SKILL_GROUPS: { label: string; skills: string[] }[] = [
  {
    label: "Getting about",
    skills: ["Climbing", "Swimming", "Running", "Riding", "Rowing", "Keeping Your Footing"],
  },
  {
    label: "Hands",
    skills: ["Cooking", "Baking", "Sewing", "Drawing", "Whittling", "Tying Knots", "Fixing Things"],
  },
  {
    label: "Quiet things",
    skills: ["Hiding", "Listening at Doors", "Moving Quietly", "Waiting Patiently", "Keeping a Secret"],
  },
  {
    label: "Out of doors",
    skills: ["Making Camp", "Foraging", "Reading the Weather", "Star-Reading", "Fishing", "Gardening"],
  },
  {
    label: "People",
    skills: ["Bargaining", "Telling a Joke", "Apologising Properly", "Asking Nicely", "Noticing a Lie"],
  },
  {
    label: "Getting a fright",
    skills: ["Staying Calm", "Being Brave First", "Carrying On Anyway"],
  },
];

/** Every skill in the game: the callings' suggestions plus the general pool. */
export const ALL_SKILLS: string[] = [
  ...new Set([
    ...ARCHETYPES.flatMap((archetype) => archetype.skills),
    ...SKILL_GROUPS.flatMap((group) => group.skills),
  ]),
].sort();

/**
 * The whole list, in browsable groups, with each calling's own three first.
 *
 * Built here rather than in the component so the ordering — your calling's
 * suggestions, then everything else by theme — is one decision in one place.
 */
export function skillGroupsFor(archetype: string): { label: string; skills: string[] }[] {
  const own = ARCHETYPES.find(
    (option) => option.value.toLocaleLowerCase() === archetype.trim().toLocaleLowerCase(),
  );

  return [
    ...(own ? [{ label: `A ${own.value} often knows`, skills: own.skills }] : []),
    ...SKILL_GROUPS,
  ];
}

export const AGE_BANDS = [
  { value: "CHILD", label: "Child", blurb: "Small, quick, and underestimated." },
  { value: "TEEN", label: "Teen", blurb: "Capable, and knows it. Mostly." },
  { value: "GROWNUP", label: "Grown-up", blurb: "Steady hands, tired feet." },
  { value: "ELDER", label: "Elder", blurb: "Has seen this before. Has opinions." },
] as const;

/** Offered as buttons; the field accepts anything typed instead. */
export const PRONOUN_PRESETS = ["she/her", "he/him", "they/them"];

/**
 * The signatures a calling has unlocked by this level.
 *
 * Free text means a great many callings are not ones we know — the Cloud Baker
 * has none, and that is fine. Nobody is worse off than they were: a signature is
 * something eight callings gained, not something anybody lost.
 *
 * Called without a level it returns all of them, which is what a page listing
 * "what this calling can do" wants. The play picker passes her real level.
 */
export function signaturesFor(archetype: string, level = Number.MAX_SAFE_INTEGER): Signature[] {
  const own = ARCHETYPES.find(
    (option) => option.value.toLocaleLowerCase() === archetype.trim().toLocaleLowerCase(),
  );
  return (own?.signatures ?? []).filter((signature) => signature.fromLevel <= level);
}

export function findArchetype(value: string): ArchetypeOption | undefined {
  return ARCHETYPES.find((archetype) => archetype.value === value);
}

export function findRace(value: string): RaceOption | undefined {
  return RACES.find((race) => race.value === value);
}
