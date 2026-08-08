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
export const STAT_MAX = 5;
export const STAT_BUDGET = 12;

export const SKILLS_PER_CHARACTER = 2;

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

/** The modifier a stat contributes to a d20 check. */
export function statModifier(value: number): number {
  return value - 3;
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

/** Character XP needed for each level. Index 0 is unused; levels start at 1. */
const LEVEL_THRESHOLDS = [0, 0, 10, 25, 45, 70, 100, 140, 190, 250];

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
