/**
 * Core character rules.
 *
 * Deliberately import-free so it can be used from server actions, client
 * components and tests alike without dragging in the database.
 */

export const STATS = ["might", "wits", "heart", "spark"] as const;
export type StatKey = (typeof STATS)[number];

export const STAT_INFO: Record<StatKey, { label: string; blurb: string }> = {
  might: { label: "Might", blurb: "Lifting, carrying, holding on, standing firm." },
  wits: { label: "Wits", blurb: "Noticing, puzzling out, remembering, planning." },
  heart: { label: "Heart", blurb: "Comforting, persuading, being brave for someone else." },
  spark: { label: "Spark", blurb: "Magic, wonder, and talking to things that shouldn't talk." },
};

// Every stat starts at MIN and the player distributes the rest. A budget of 12
// across four stats averages 3 — competent everywhere, exceptional nowhere,
// unless you choose otherwise.
export const STAT_MIN = 1;
/** The highest a stat may be *built* at. Growth goes further; see STAT_CEILING. */
export const STAT_MAX = 5;
export const STAT_BUDGET = 12;

/**
 * The highest a stat can ever reach, through play.
 *
 * A character used to be finished the moment she was built: twelve points spent
 * once, and those four numbers were identical at level 9. Nothing on the sheet
 * moved except a skill rank, which meant a girl could play six adventures and
 * her adventurer would be the same adventurer. That is how a table stops
 * wanting to play.
 *
 * So the sheet now fills up — from twenty at the outset to forty-eight at the
 * far end of a long career, which takes hundreds of experience to reach and is
 * meant to.
 */
export const STAT_CEILING = 12;

/**
 * How much experience buys the next point.
 *
 * One sphere lights up every ten, which is roughly five good rolls or one
 * chapter finished — often enough to feel like it is happening, rarely enough
 * that it stays an event.
 */
export const XP_PER_STAT_POINT = 10;

/** How many points of growth this much experience has earned, in total. */
export function statPointsEarned(xp: number): number {
  return Math.floor(xp / XP_PER_STAT_POINT);
}

/**
 * How many she has left to spend.
 *
 * Derived rather than stored: what she has spent is simply how far her stats
 * have risen above the budget she was built with. No column to drift out of
 * step with the stats themselves, and no migration to invent one.
 */
export function statPointsUnspent(stats: StatBlock, xp: number): number {
  return Math.max(0, statPointsEarned(xp) - (totalSpent(stats) - STAT_BUDGET));
}

/** Whether one more point may go into this stat. */
export function canRaise(stats: StatBlock, xp: number, stat: StatKey): boolean {
  return statPointsUnspent(stats, xp) > 0 && stats[stat] < STAT_CEILING;
}

export const SKILLS_PER_CHARACTER = 2;

/**
 * How many skills a character has room for, by level.
 *
 * The one thing still worth earning once the stat sheet is full. Stats stop at
 * a ceiling and knacks run out at the end of the catalogue, but there is no
 * natural limit on the number of things a person turns out to be good at — and
 * skills are the reward the girls actually notice, because each one is named
 * after something they *did*. "Humming" is on the sheet because she hummed at a
 * frightened creature four times.
 *
 * Two extra slots, at levels 6 and 11, which is slow on purpose: room to learn
 * is only worth having if learning something is still an event.
 *
 * Additive with Fast Learner rather than instead of it — the knack is somebody's
 * choice, and a choice that stops mattering once you level up is not a choice.
 */
export function skillRoomForLevel(level: number): number {
  let room = 0;
  if (level >= 6) room += 1;
  if (level >= 11) room += 1;
  return room;
}

export type StatBlock = Record<StatKey, number>;

export function totalSpent(stats: StatBlock): number {
  return STATS.reduce((sum, stat) => sum + stats[stat], 0);
}

export function pointsRemaining(stats: StatBlock): number {
  return STAT_BUDGET - totalSpent(stats);
}

export type StatValidation = { ok: true } | { ok: false; reason: string };

/**
 * Enforced server-side on every save. The builder UI prevents illegal spreads,
 * but the UI is not a security boundary — a form post can say anything.
 */
export function validateStats(stats: StatBlock): StatValidation {
  for (const stat of STATS) {
    const value = stats[stat];
    if (!Number.isInteger(value)) {
      return { ok: false, reason: `${STAT_INFO[stat].label} must be a whole number.` };
    }
    if (value < STAT_MIN || value > STAT_MAX) {
      return {
        ok: false,
        reason: `${STAT_INFO[stat].label} must be between ${STAT_MIN} and ${STAT_MAX}.`,
      };
    }
  }

  const spent = totalSpent(stats);
  if (spent !== STAT_BUDGET) {
    return {
      ok: false,
      reason:
        spent > STAT_BUDGET
          ? `That spends ${spent} points, which is ${spent - STAT_BUDGET} too many.`
          : `You still have ${STAT_BUDGET - spent} point${STAT_BUDGET - spent === 1 ? "" : "s"} left to spend.`,
    };
  }

  return { ok: true };
}

/**
 * The modifier a stat contributes to a d20 check.
 *
 * Straight up to 5, then flattening: above that, two points buy one. The
 * flattening is what keeps the dice worth rolling. Left as a straight line, a
 * maxed stat would be +9, and a HARD check would land on a roll of 6 — at which
 * point the storyteller may as well not ask. With the curve the same character
 * is +6 and still needs a 10, so the moment before the die stops is still a
 * moment.
 *
 * Nothing below 6 changes, so no adventurer who already exists is worth less
 * than she was yesterday.
 */
export function statModifier(value: number): number {
  if (value <= 5) return value - 3;
  return 2 + Math.ceil((value - 5) / 2);
}

// ---- Relationships ---------------------------------------------------------

export const RELATIONSHIP_KINDS = [
  "PARENT",
  "CHILD",
  "SIBLING",
  "GRANDPARENT",
  "GRANDCHILD",
  "PET",
  "FRIEND",
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

const RECIPROCAL: Record<RelationshipKind, RelationshipKind> = {
  PARENT: "CHILD",
  CHILD: "PARENT",
  SIBLING: "SIBLING",
  GRANDPARENT: "GRANDCHILD",
  GRANDCHILD: "GRANDPARENT",
  // A pet's person is a FRIEND rather than an owner — this is a game about
  // companionship, and the bond runs both ways.
  PET: "FRIEND",
  FRIEND: "FRIEND",
};

export function reciprocalOf(kind: RelationshipKind): RelationshipKind {
  return RECIPROCAL[kind];
}

export const RELATIONSHIP_LABELS: Record<RelationshipKind, string> = {
  PARENT: "parent of",
  CHILD: "child of",
  SIBLING: "sibling of",
  GRANDPARENT: "grandparent of",
  GRANDCHILD: "grandchild of",
  PET: "companion animal of",
  FRIEND: "friend of",
};

/**
 * Puts a character pair into the canonical order used for storage, and flips
 * the relationship kind if the arguments had to be swapped.
 *
 * Storing one row per pair keeps a single bond counter; without a canonical
 * order the same relationship could be written twice under two ids.
 */
export function canonicalPair(
  fromId: string,
  toId: string,
  fromToKind: RelationshipKind,
): { characterAId: string; characterBId: string; aToB: RelationshipKind } {
  if (fromId < toId) {
    return { characterAId: fromId, characterBId: toId, aToB: fromToKind };
  }
  return { characterAId: toId, characterBId: fromId, aToB: reciprocalOf(fromToKind) };
}

/** How a given character relates to the other side of a stored row. */
export function kindFromPerspective(
  row: { characterAId: string; aToB: RelationshipKind },
  characterId: string,
): RelationshipKind {
  return row.characterAId === characterId ? row.aToB : reciprocalOf(row.aToB);
}

// ---- Bonds -----------------------------------------------------------------

/** Bond XP needed to reach each level. Index 0 is level 0. */
const BOND_THRESHOLDS = [0, 3, 8, 15, 24, 35];

export const MAX_BOND_LEVEL = BOND_THRESHOLDS.length - 1;

export function bondLevelFor(bondXp: number): number {
  let level = 0;
  for (let index = 1; index < BOND_THRESHOLDS.length; index += 1) {
    if (bondXp >= BOND_THRESHOLDS[index]) level = index;
  }
  return level;
}

export function bondProgress(bondXp: number): { level: number; into: number; needed: number | null } {
  const level = bondLevelFor(bondXp);
  if (level >= MAX_BOND_LEVEL) return { level, into: 0, needed: null };

  const floor = BOND_THRESHOLDS[level];
  const ceiling = BOND_THRESHOLDS[level + 1];
  return { level, into: bondXp - floor, needed: ceiling - floor };
}

// ---- Levels ----------------------------------------------------------------

/**
 * Character XP needed for each level. Index 0 is unused; levels start at 1.
 *
 * The ladder used to stop at level 9, at 250 xp, and that turned out to be the
 * wrong place for it in two separate ways.
 *
 * Filling the stat sheet takes 360 xp — four stats from the build cap of 5 to
 * the growth ceiling of 12, at ten xp a point. So there was a stretch of 110 xp
 * where levelling had finished and stat growth had not, and every roll in it
 * bought a point with nothing to announce. And past 360, xp bought *nothing* —
 * rolls kept paying 1 to 3 forever into a number that could no longer move.
 *
 * The other way it was wrong: a character earns `level - 1` knacks, so a cap of
 * 9 meant 8 knacks, out of a catalogue of 12. Four of them could never be had by
 * anybody. Ending at 13 makes the whole catalogue reachable and keeps something
 * arriving after the stats are full, which is the point — the girls should
 * always be a session away from something new.
 *
 * The four new steps are a first guess at pacing and are meant to be tuned after
 * a few real evenings, not argued about in advance.
 */
const LEVEL_THRESHOLDS = [0, 0, 10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 490, 590];

export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;

/**
 * How far a character is through their current level.
 *
 * `needed` is null at the cap, so callers can render "as far as it goes"
 * rather than a full bar that never moves.
 */
export function levelProgress(xp: number): { level: number; into: number; needed: number | null } {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: null };

  const floor = LEVEL_THRESHOLDS[level];
  const ceiling = LEVEL_THRESHOLDS[level + 1];
  return { level, into: xp - floor, needed: ceiling - floor };
}

export function levelFor(xp: number): number {
  let level = 1;
  for (let index = 2; index < LEVEL_THRESHOLDS.length; index += 1) {
    if (xp >= LEVEL_THRESHOLDS[index]) level = index;
  }
  return level;
}

/** What a level costs, from nothing. Clamped, so the cap is a flat line. */
export function xpForLevel(level: number): number {
  const index = Math.min(Math.max(level, 1), MAX_LEVEL);
  return LEVEL_THRESHOLDS[index];
}

// ---- Skill growth ----------------------------------------------------------

/// Skill xp needed for each rank. Index 0 is unused; ranks start at 1.
const SKILL_THRESHOLDS = [0, 0, 6, 16, 32];

export const MAX_SKILL_RANK = SKILL_THRESHOLDS.length - 1;

export function skillRankFor(xp: number): number {
  let rank = 1;
  for (let index = 2; index < SKILL_THRESHOLDS.length; index += 1) {
    if (xp >= SKILL_THRESHOLDS[index]) rank = index;
  }
  return rank;
}

export function skillProgress(xp: number): { rank: number; into: number; needed: number | null } {
  const rank = skillRankFor(xp);
  if (rank >= MAX_SKILL_RANK) return { rank, into: 0, needed: null };

  const floor = SKILL_THRESHOLDS[rank];
  const ceiling = SKILL_THRESHOLDS[rank + 1];
  return { rank, into: xp - floor, needed: ceiling - floor };
}

/**
 * Skill xp for using a skill on a check.
 *
 * Deliberately flat rather than outcome-weighted: a skill improves because it
 * was used, and a child whose roll went badly should still see the thing they
 * are good at getting better.
 */
export const SKILL_XP_PER_USE = 1;

/**
 * What finishing a quest is worth, to everybody who was there.
 *
 * Shared rather than given to whoever happened to be holding the thing at the
 * end: a chapter is finished by the party, and paying only the finder would
 * turn a cooperative game into a race to grab. A good roll is worth 2, so a
 * chapter is worth roughly four of them and a side quest half that — enough to
 * feel like an event, not enough to make the dice pointless.
 *
 * A personal quest is the exception and pays only her. It is the one thing on
 * the board that was hers, and splitting it four ways would take that back. Set
 * between the two so it is worth chasing without being the best way to level.
 */
export const QUEST_XP = { MAIN: 8, SIDE: 4, PERSONAL: 6 } as const;

// ---- Family Moves ----------------------------------------------------------

/**
 * What bonds are *for*.
 *
 * Every move needs two characters, so none of them can be used alone — that is
 * the whole point. Each is spendable once per scene, which keeps it a moment
 * rather than a routine, and each maps onto something the dice already do so
 * the effect is real rather than narrated flavour.
 */
export type FamilyMove = {
  key: string;
  name: string;
  /** Bond level required between the two characters. */
  requires: number;
  /** Shown to the player. */
  blurb: string;
  /** Told to the Game Master so it narrates the moment properly. */
  narrationHint: string;
};

export const FAMILY_MOVES: FamilyMove[] = [
  {
    key: "lend_a_hand",
    name: "Lend a Hand",
    requires: 1,
    blurb: "Add +2 to what they are trying to do.",
    narrationHint: "helped directly, hands-on, at just the right moment",
  },
  {
    key: "stand_together",
    name: "Stand Together",
    requires: 2,
    blurb: "Roll twice and keep the better roll.",
    narrationHint: "stood shoulder to shoulder and tried it together",
  },
  {
    key: "never_alone",
    name: "Never Alone",
    requires: 3,
    blurb: "If it goes wrong, try once more.",
    narrationHint: "refused to let them fail alone, and they went again",
  },
  {
    key: "two_as_one",
    name: "Two as One",
    requires: 4,
    blurb: "A near miss becomes a success.",
    narrationHint: "moved as though they shared one mind",
  },
  {
    key: "hearthlight",
    name: "Hearthlight",
    requires: 5,
    blurb: "It simply works. Once, when it matters most.",
    narrationHint: "drew on everything they have been through together",
  },
];

export function familyMoveByKey(key: string): FamilyMove | undefined {
  return FAMILY_MOVES.find((move) => move.key === key);
}

/** Which moves a given bond level has unlocked. */
export function movesUnlockedAt(bondLevel: number): FamilyMove[] {
  return FAMILY_MOVES.filter((move) => move.requires <= bondLevel);
}

/** Moves unlocked by crossing from one bond level to another. */
export function movesUnlockedBetween(before: number, after: number): FamilyMove[] {
  return FAMILY_MOVES.filter((move) => move.requires > before && move.requires <= after);
}
