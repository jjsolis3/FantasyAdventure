/**
 * Core character rules.
 *
 * Deliberately import-free so it can be used from server actions, client
 * components and tests alike without dragging in the database.
 */

export const STATS = ["might", "wits", "heart", "spark", "grace", "luck", "grit"] as const;
export type StatKey = (typeof STATS)[number];

/**
 * The seven things a check can be about.
 *
 * Four for a long time, and four was thin: spreading twelve points over four
 * sliders is not really a decision, and every character came out much like every
 * other. Three more make the builder worth lingering over — and they were chosen
 * to be things the storyteller can tell apart, because two stats it cannot
 * distinguish are worse than one stat too few.
 *
 * Might's blurb used to read "Lifting, carrying, holding on, standing firm",
 * where the second half is exactly what Grit is now for. It has been narrowed to
 * pure force so the two do not compete for the same checks.
 */
export const STAT_INFO: Record<StatKey, { label: string; blurb: string }> = {
  might: { label: "Might", blurb: "Force. Lifting, shoving, breaking, carrying something heavy." },
  wits: { label: "Wits", blurb: "Noticing, puzzling out, remembering, planning." },
  heart: { label: "Heart", blurb: "Comforting, persuading, being brave for somebody else." },
  spark: { label: "Spark", blurb: "Magic, wonder, and talking to things that shouldn't talk." },
  grace: { label: "Grace", blurb: "Balance, sneaking, quick hands, dodging, climbing without falling." },
  luck: {
    label: "Luck",
    blurb: "What turns up. Rummaging, shortcuts, whether the loose board is the right one.",
  },
  grit: { label: "Grit", blurb: "Keeping going. Holding on, staying awake, not being scared off." },
};

export const STAT_MIN = 1;
/** The highest a stat may be *built* at. Growth goes further; see STAT_CEILING. */
export const STAT_MAX = 5;

/**
 * The value that rolls at +0 — see `statModifier`, where 3 is the hinge.
 *
 * Named because the budget is built from it, and because the relationship
 * between the two is the whole reason the budget is not a hardcoded number.
 */
export const NEUTRAL_STAT = 3;

/**
 * How many points a new adventurer has to spend.
 *
 * Twelve, on top of a floor of one in everything. The previous rule handed out
 * three in every stat and asked the player to shuffle them about, which meant a
 * builder where the interesting move was taking points *away* from things — and
 * an adventurer who was already competent at all seven before she had done
 * anything at all.
 *
 * Starting at the floor makes the builder a series of decisions rather than a
 * set of sliders, and it leaves somewhere to grow into: an average stat now
 * sits below the value that rolls at +0, and climbing above it is something
 * play pays for.
 */
export const POINTS_TO_SPEND = 12;

/**
 * What a whole freshly-built stat block adds up to.
 *
 * Floor everywhere, plus the points. Derived rather than written down, because
 * the last time this was a literal it was 12 across four stats — exactly three
 * each, so an average character rolled at +0 — and adding three stats without
 * moving it would have made every character in the game quietly worse at
 * everything.
 */
export const STAT_BUDGET = STATS.length * STAT_MIN + POINTS_TO_SPEND;

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
 * Moved from ten to forty with the level curve, and it had to move with it. The
 * seven stats hold 49 points of growth between the build cap of 5 and the
 * ceiling of 12; at ten apiece that is 490 experience, which the old ladder
 * reached around level twelve and a real family reached in a handful of
 * evenings. At forty it is 1960, just under the 2080 the ladder now ends at —
 * so the sheet fills up at roughly the same moment the levels run out, which is
 * the relationship these two numbers are supposed to have.
 *
 * In practice: about one point an evening. Enough to be a decision, rare enough
 * to be an event.
 */
export const XP_PER_STAT_POINT = 40;

/** How many points of growth this much experience has earned, in total. */
export function statPointsEarned(xp: number): number {
  return Math.floor(xp / XP_PER_STAT_POINT);
}

/**
 * How many she has left to spend.
 *
 * What she has spent is how far her stats have risen above the budget she was
 * *built* with — which is why that number has to be passed in rather than read
 * off the current constant.
 *
 * It did read off the constant, and that was fine right up until the build
 * budget changed. Twenty-one became nineteen, and every adventurer already in
 * the house would have appeared to have spent two points she never spent:
 * silently, with no message, taking two growth points off a child who had
 * earned them. `Character.buildBudget` records what each one actually started
 * with, so the old ones keep their arithmetic and the new ones get the new
 * rule.
 *
 * This is the second time this budget has moved. It will not be the last.
 */
export function statPointsUnspent(
  stats: StatBlock,
  xp: number,
  builtWith: number = STAT_BUDGET,
): number {
  return Math.max(0, statPointsEarned(xp) - (totalSpent(stats) - builtWith));
}

/** Whether one more point may go into this stat. */
export function canRaise(
  stats: StatBlock,
  xp: number,
  stat: StatKey,
  builtWith: number = STAT_BUDGET,
): boolean {
  return statPointsUnspent(stats, xp, builtWith) > 0 && stats[stat] < STAT_CEILING;
}

export const SKILLS_PER_CHARACTER = 2;

/** How many levels between one chosen skill and the next. */
export const LEVELS_PER_SKILL = 3;

/**
 * How many skills she is entitled to have *chosen*.
 *
 * Two at the builder, then one more every third level: three at level 4, four
 * at 7, five at 10, six at 13.
 *
 * It was one at every level after the second, and a family found the problem
 * immediately — *"at level 4, I should not have 5 skills already"*. Two players
 * came out of one evening at level 4 with four skills each, most of a knack
 * catalogue, and a character sheet that had stopped having room to grow. A
 * choice that arrives every session is not a reward; it is admin.
 *
 * Every level still hands over something — a knack — so a level-up is never
 * empty. Every third one hands over two things, which is what makes those ones
 * worth waiting for.
 *
 * Nothing is ever taken away. An adventurer already holding more skills than
 * this allows keeps every one of them; `skillPicksUnspent` clamps at zero, so
 * she simply waits longer for her next pick. See the note there.
 */
export function chosenSkillsFor(level: number): number {
  return SKILLS_PER_CHARACTER + Math.max(0, Math.floor((level - 1) / LEVELS_PER_SKILL));
}

/**
 * The level at which her next chosen skill arrives, or null at the cap.
 *
 * Needed because slowing the entitlement makes the *absence* of a choice the
 * normal state, and an absence with no explanation reads as the game having
 * forgotten her. "Your next new skill is at level 7" is a small sentence that
 * turns four quiet level-ups into a countdown.
 *
 * Takes what she already holds, not just her level, so an adventurer who is
 * ahead of the new ladder is told the truth about when it catches up with her.
 */
export function nextSkillLevel(level: number, chosen: number): number | null {
  for (let at = Math.max(level, 1); at <= MAX_LEVEL; at += 1) {
    if (chosenSkillsFor(at) > chosen) return at;
  }
  return null;
}

/**
 * Spare slots kept above what she is entitled to choose.
 *
 * The nicest thing on a sheet is a skill that arrived because she kept doing it
 * — four goes at climbing turning into Climbing, without anybody deciding it
 * should. If the cap were exactly what she may pick, that would stop the moment
 * she used her level-up choice, and the game would have traded its best mechanic
 * for its newest one.
 */
export const PRACTICE_HEADROOM = 2;

/**
 * The most skills that fit on one sheet, from every source at once.
 *
 * This was a flat six with an extra at levels 6 and 11, which was right when two
 * skills were chosen at the builder and everything else arrived by accident.
 * With a choice at every level it would have become a wall she hit around level
 * six and never got past.
 *
 * Fast Learner still adds on top rather than instead — a knack that stops
 * mattering once you level up is not a choice.
 */
export function skillRoom(level: number, knackExtras: number = 0): number {
  return chosenSkillsFor(level) + PRACTICE_HEADROOM + knackExtras;
}


export type StatBlock = Record<StatKey, number>;

/**
 * A whole stat block from however much of one you have.
 *
 * Anything unnamed comes back at the **neutral** value — so this reads as "a
 * character who is unremarkable at everything you did not mention", which is
 * what every caller actually wants from it.
 *
 * It used to be more than that: while every stat began at three, `statBlock({})`
 * was also a legal fully-spent build. That stopped being true when a new
 * adventurer started at the floor with twelve points in hand, and the claim has
 * been removed rather than the behaviour changed — filling at the floor instead
 * would quietly turn every "ordinary character" in the tests into somebody who
 * rolls at −2 in three stats.
 *
 * What the builder opens on is a separate thing, and lives with the builder.
 *
 * Worth having beyond tests: a partial block from anywhere is completed the
 * same way every time rather than by each caller remembering to fill the gaps,
 * and forgetting a stat is how a stat goes missing.
 */
export function statBlock(partial: Partial<StatBlock> = {}): StatBlock {
  return Object.fromEntries(
    STATS.map((stat) => [stat, partial[stat] ?? NEUTRAL_STAT]),
  ) as StatBlock;
}

/**
 * Pulls the stats off a character row.
 *
 * Ten or so places used to write `{ might: row.might, wits: row.wits, ... }` by
 * hand, which is fine at four and a liability at seven: every one of them is a
 * place a new stat can be forgotten, and forgetting one is silent — the block
 * just carries a stale value and the sheet quietly disagrees with itself.
 */
export function statsOf(row: Record<string, unknown>): StatBlock {
  return Object.fromEntries(STATS.map((stat) => [stat, Number(row[stat] ?? 0)])) as StatBlock;
}

/** The other direction, for writing a whole block back to the database. */
export function statColumns(stats: StatBlock): Record<StatKey, number> {
  return Object.fromEntries(STATS.map((stat) => [stat, stats[stat]])) as Record<StatKey, number>;
}

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
  // A stat that never arrived counts as an ordinary one.
  //
  // Not defensive programming for its own sake — this is a bug that actually
  // happened. Two places in the turn pipeline built a party's stats as a
  // four-key literal with a cast, and when the game went to seven stats those
  // literals stayed as they were. Grace, Luck and Grit reached this function as
  // `undefined`, `undefined - 3` is NaN, and every comparison against NaN is
  // false — so a Grace check was a guaranteed complication however well the girl
  // rolled, all evening, with nothing anywhere saying why.
  //
  // The callers are fixed and go through `statsOf` now. This is here because the
  // failure was silent and landed on a nine-year-old: whatever goes wrong next,
  // an ordinary roll is a far better place to land than a cursed one.
  if (!Number.isFinite(value)) return 0;

  if (value <= 5) return value - 3;
  return 2 + Math.ceil((value - 5) / 2);
}

// ---- Luck ------------------------------------------------------------------

/**
 * How much of a chance one point of Luck buys, in percent.
 *
 * Eight, which puts a built character who favours Luck at one lucky break in
 * six failed rolls and a character at the far ceiling at not quite one in two.
 * Tuned to be *noticed* without being relied on: often enough that a girl who
 * spent her points on Luck sees it happen most evenings, rare enough that the
 * rest of her sheet still decides how the night goes.
 */
export const LUCK_NUDGE_STEP = 8;

/**
 * How often fortune steps in on a roll that was about to go badly.
 *
 * Luck was a plain stat for a long while, and a plain stat is the one thing
 * Luck cannot be. The other six answer "how good are you at this?", which is a
 * question the storyteller asks by picking one of them. Luck answers "did it
 * happen to go your way?" — and something that only counts when it is *chosen*
 * is not luck at all, it is a talent for rummaging.
 *
 * So Luck now bends the dice on every check, whichever stat was rolled.
 *
 * Derived from `statModifier` rather than given a curve of its own, which is
 * the whole trick here and worth spelling out:
 *
 *   - **Neutral Luck does nothing.** `statModifier(3)` is 0, so a character who
 *     spread her points evenly has ordinary luck and no hidden thumb on the
 *     scale. That is the same hinge every other stat turns on.
 *   - **Low Luck is never punished.** Clamped at zero, so an unlucky adventurer
 *     simply gets no help — the dice are not additionally cruel to a child who
 *     put her points somewhere else.
 *   - **It flattens where rolls flatten.** Past 5 the modifier curve slows, and
 *     the nudge slows with it for free, so the far end of a long career cannot
 *     turn into a character who never really fails.
 *
 * The one thing it must never be is a flat bonus on every roll. Luck helps with
 * everything and the other six help with one thing each, so a bonus would make
 * it strictly the best stat on the sheet — and a nine-year-old works that out in
 * one evening, after which every adventurer in the house is a Luck adventurer.
 * A chance to lift a roll that already failed cannot be aimed, cannot be counted
 * on, and never turns a good roll into a better one. See `resolveCheck`.
 */
export function luckChance(luck: number): number {
  return Math.max(0, statModifier(luck)) * LUCK_NUDGE_STEP;
}

/**
 * The same thing said the way a child reads it — "about 1 roll in 6".
 *
 * Printed beside Luck wherever a point can be spent, because "16%" is a number
 * a ten-year-old can read and not a number she can *feel*, and the entire point
 * of putting a point into Luck is knowing what it bought.
 */
export function luckOdds(luck: number): string {
  const chance = luckChance(luck);
  if (chance <= 0) return "ordinary luck — nothing bends";
  return `fortune steps in about 1 time in ${Math.round(100 / chance)}`;
}

/**
 * What Luck does that the other six do not, in one sentence for a nine-year-old.
 *
 * Kept out of `STAT_INFO.luck.blurb` on purpose. That blurb is read by two very
 * different audiences — a child looking at her sheet, and the adjudicator
 * deciding which stat a check is about — and the adjudicator has no business
 * knowing about the nudge. It never chooses it, the server applies it, and a
 * model told that Luck quietly helps with everything will start reaching for
 * Luck on checks that are plainly about climbing a wall.
 */
export const LUCK_NUDGE_NOTE =
  "Luck bends every other roll too: a check that was going badly sometimes turns out better than it should.";

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
 * ## Retuned after two real evenings, which is what they were for
 *
 * The first guess was far too generous, and a family reported it precisely:
 * *"we have not completed a full quest, but I was able to increase my stats by
 * points, add 3 new skills and multiple knacks."* Sixteen turns of two players
 * earned about 45 experience each — which under the old ladder was **level 4**.
 * A level every five to eight turns; two or three levels an evening; a whole
 * character finished long before the story library was.
 *
 * The new steps are 40, 60, 80, 100, 120, 150, 180, 210, 240, 270, 300, 330 —
 * so an evening is worth roughly one level early on and rather less later, and
 * reaching thirteen is a couple of years of weekly play rather than a fortnight.
 *
 * Two things had to move with it, and both are in this file:
 *
 *   - `XP_PER_STAT_POINT`, or the sheet would fill up in a tenth of a career.
 *   - Nothing at all about the *stored* level, which is what keeps this from
 *     taking anything away. See `levelReached`.
 */
const LEVEL_THRESHOLDS = [
  0, 0, 40, 100, 180, 280, 400, 550, 730, 940, 1180, 1450, 1750, 2080,
];

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

/**
 * The level a character is actually on. Never goes down.
 *
 * The whole of the answer to "how do you make a level curve four times steeper
 * without punishing the people already playing on the old one". Orin is level 4
 * on 45 experience; the new ladder says 45 is level 2. Recomputing would take
 * two levels off a real child's adventurer overnight, along with everything
 * they imply — the knack ladder, how far off a second signature is, and the
 * number on the front of her sheet, which is the one she cares about.
 *
 * So the stored level is a high-water mark. It rises when the curve says so and
 * never falls, which means a character ahead of the new curve simply stays
 * where she is until the curve catches up with her. Nobody loses anything;
 * levelling just goes quiet for a while, which is precisely what was asked for.
 *
 * Every writer of `Character.level` goes through this. There is no other way to
 * set it.
 */
export function levelReached(xp: number, stored: number): number {
  return Math.max(stored, levelFor(xp));
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

// ---- Whose move it is ------------------------------------------------------

/**
 * The three kinds of closeness these moves come out of.
 *
 * The game has stored a relationship kind since the beginning and used it for
 * exactly one thing: a label on a sheet. Every pair unlocked the same five
 * moves with the same five names, so *Stand Together* between two sisters and
 * *Stand Together* between a father and his daughter were the same sentence —
 * which is a shame, because they are not remotely the same thing.
 *
 * Three rather than seven, because seven sets of five names is thirty-five
 * pieces of writing to keep good and most of them would be near-duplicates. A
 * grandparent and a parent are the same move from a child's side; a best friend
 * and a beloved dog are closer than either is to a sibling.
 */
export type MoveFlavour = "SIBLINGS" | "ELDER" | "FRIENDS";

const FLAVOUR_OF: Record<RelationshipKind, MoveFlavour> = {
  SIBLING: "SIBLINGS",
  PARENT: "ELDER",
  CHILD: "ELDER",
  GRANDPARENT: "ELDER",
  GRANDCHILD: "ELDER",
  FRIEND: "FRIENDS",
  // A companion animal is a friend who cannot talk, which is closer to a best
  // friend than to anything else on this list.
  PET: "FRIENDS",
};

export function flavourOf(kind: RelationshipKind): MoveFlavour {
  return FLAVOUR_OF[kind] ?? "FRIENDS";
}

/**
 * What each move is called, depending on who is using it.
 *
 * The mechanics are untouched — every one of these resolves through the same
 * `move.key` in `resolveCheck`, and a family that renames nothing plays exactly
 * the same game. What changes is the sentence a child reads on the button and
 * the sentence the storyteller is handed, and those are the whole reason
 * anybody remembers a move at all.
 *
 * First drafts, all fifteen. Worth reading aloud before they are final: a name
 * the girls find funny is worth more than one that is precise.
 */
const MOVE_FLAVOURS: Record<MoveFlavour, Record<string, Omit<FamilyMove, "key" | "requires">>> = {
  SIBLINGS: {
    lend_a_hand: {
      name: "Shove Over",
      blurb: "Move up and let them in. Add +2 to what they are doing.",
      narrationHint: "elbowed in beside them without being asked, the way siblings do",
    },
    stand_together: {
      name: "Both of Us or Neither",
      blurb: "Roll twice and keep the better roll.",
      narrationHint: "refused to let them try it alone, so they went at it as a pair",
    },
    never_alone: {
      name: "You Are Not Doing That Alone",
      blurb: "If it goes wrong, try once more.",
      narrationHint: "caught them mid-mistake and made them go again, immediately",
    },
    two_as_one: {
      name: "You Always Do That",
      blurb: "A near miss becomes a success.",
      narrationHint: "knew exactly what they were about to do, because they always do that",
    },
    hearthlight: {
      name: "Since We Were Small",
      blurb: "It simply works. Once, when it matters most.",
      narrationHint: "fell into something they have been doing together since they were small",
    },
  },

  ELDER: {
    lend_a_hand: {
      name: "Here, Let Me",
      blurb: "A steadier pair of hands. Add +2 to what they are doing.",
      narrationHint: "steadied it for them without taking it over",
    },
    stand_together: {
      name: "On My Shoulders",
      blurb: "Roll twice and keep the better roll.",
      narrationHint: "lifted them to where they could reach it themselves",
    },
    never_alone: {
      name: "Go On. I Am Right Here.",
      blurb: "If it goes wrong, try once more.",
      narrationHint: "did not fix it, and did not leave — just told them to try again",
    },
    two_as_one: {
      name: "I Knew You Would",
      blurb: "A near miss becomes a success.",
      narrationHint: "was not surprised for a second, and said so",
    },
    hearthlight: {
      name: "Everything I Know",
      blurb: "It simply works. Once, when it matters most.",
      narrationHint: "handed over everything they know about this, all at once",
    },
  },

  FRIENDS: {
    lend_a_hand: {
      name: "Boost",
      blurb: "Cupped hands and a heave. Add +2 to what they are doing.",
      narrationHint: "gave them a leg up without needing to be asked twice",
    },
    stand_together: {
      name: "On Three",
      blurb: "Roll twice and keep the better roll.",
      narrationHint: "counted to three out loud and went at exactly the same moment",
    },
    never_alone: {
      name: "Not Without You",
      blurb: "If it goes wrong, try once more.",
      narrationHint: "was not going anywhere without them, so they had another go",
    },
    two_as_one: {
      name: "Same Idea",
      blurb: "A near miss becomes a success.",
      narrationHint: "had the very same idea at the very same second",
    },
    hearthlight: {
      name: "Best in the World",
      blurb: "It simply works. Once, when it matters most.",
      narrationHint: "drew on being the best friend anybody at this table has",
    },
  },
};

/**
 * A move, in the words that belong to this particular pair.
 *
 * Falls back to the plain version rather than throwing. A relationship kind
 * that has no flavour yet, or a move added without one, should read a little
 * generic — never break a button somebody is halfway through pressing.
 */
export function moveNamesFor(kind: RelationshipKind, move: FamilyMove): FamilyMove {
  const flavoured = MOVE_FLAVOURS[flavourOf(kind)]?.[move.key];
  return flavoured ? { ...move, ...flavoured } : move;
}

/** Which moves a given bond level has unlocked. */
export function movesUnlockedAt(bondLevel: number): FamilyMove[] {
  return FAMILY_MOVES.filter((move) => move.requires <= bondLevel);
}

/** Moves unlocked by crossing from one bond level to another. */
export function movesUnlockedBetween(before: number, after: number): FamilyMove[] {
  return FAMILY_MOVES.filter((move) => move.requires > before && move.requires <= after);
}

/**
 * What a table is told when two of them got closer.
 *
 * Until now, nothing — unless the deepening happened to cross a Family Move
 * threshold, which is roughly one time in five. So the single most rewarding
 * thing in the game, the one that pays for looking after each other and for
 * talking it over, was silent four times out of five. A reward nobody is told
 * about is not a reward; it is bookkeeping.
 *
 * Deliberately plain. The bond number is on the sheet for anybody who wants it;
 * this line is for the girl who was kind and deserves to hear that somebody
 * noticed.
 *
 * The level is only mentioned once there is one. A bond climbs several points
 * before it reaches level 1, and "grew closer — bond 0" is a sentence that
 * takes something away from a child rather than giving it to her.
 */
export function closerMessage(a: string, b: string, bondLevel: number): string {
  if (bondLevel < 1) return `${a} and ${b} grew closer.`;
  return `${a} and ${b} grew closer — bond ${bondLevel}.`;
}

/**
 * A second one of something, said in English.
 *
 * The storyteller names things with their article — "a smooth grey stone" — and
 * the sentence that announces a duplicate puts a word in front of the name. So
 * the transcript has been reading "Mira picks up another a smooth grey stone"
 * since the day items were added, which is the kind of thing a ten-year-old
 * reads out loud and then cannot stop laughing at.
 */
export function anotherMessage(character: string, item: string): string {
  const named = item.replace(/^(a|an|the)\s+/i, "");
  return `${character} picks up another ${named}.`;
}
