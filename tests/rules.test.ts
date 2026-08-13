import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LEVEL, NEUTRAL_STAT, POINTS_TO_SPEND, STATS, STAT_BUDGET, STAT_MIN, STAT_CEILING, STAT_MAX, XP_PER_STAT_POINT, bondLevelFor, bondProgress, canonicalPair, kindFromPerspective, levelFor, levelProgress, movesUnlockedAt, movesUnlockedBetween, pointsRemaining, reciprocalOf, skillProgress, skillRankFor, chosenSkillsFor, skillRoom, statBlock, statModifier, validateStats, xpForLevel, type StatBlock } from "../lib/game/rules.ts";
import { KNACKS, extraSkillRoom, knacksEarned } from "../lib/game/knacks.ts";
import { MAX_SKILLS } from "../lib/game/practice.ts";

/** An even spread of the twelve: floor everywhere, then two or three each. */
const balanced: StatBlock = statBlock({
  might: 3,
  wits: 3,
  heart: 3,
  spark: 3,
  grace: 3,
  luck: 2,
  grit: 2,
});

test("a balanced spread spends exactly the budget", () => {
  assert.equal(pointsRemaining(balanced), 0);
  assert.deepEqual(validateStats(balanced), { ok: true });
});

test("a specialist spread is legal if it totals the budget", () => {
  // Three things she is very good at and four she is not, which is now a build
  // a child can actually make: twelve points buys three stats at the cap.
  const specialist: StatBlock = statBlock({
    might: 5,
    wits: 5,
    heart: 5,
    spark: 1,
    grace: 1,
    luck: 1,
    grit: 1,
  });
  assert.deepEqual(validateStats(specialist), { ok: true });
});

test("rejects overspending", () => {
  const result = validateStats(statBlock({ might: 5, wits: 5, heart: 5, spark: 5 }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /too many/);
});

test("rejects underspending", () => {
  const result = validateStats(statBlock({ might: 1, wits: 1, heart: 1, spark: 1 }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /left to spend/);
});

test("rejects a stat above the maximum even when the total is right", () => {
  // 6 + 3 + 2 + 1 = 12, the correct total, but 6 exceeds the cap.
  const result = validateStats(statBlock({ might: 6, wits: 3, heart: 2, spark: 1 }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /between/);
});

test("rejects a stat below the minimum even when the total is right", () => {
  const result = validateStats(statBlock({ might: 5, wits: 5, heart: 2, spark: 0 }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /between/);
});

test("rejects non-integer stats", () => {
  const result = validateStats(statBlock({ might: 3.5, wits: 3.5, heart: 3, spark: 2 }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /whole number/);
});

test("stat modifiers centre on the average", () => {
  assert.equal(statModifier(3), 0);
  assert.equal(statModifier(5), 2);
  assert.equal(statModifier(1), -2);
});

test("the budget is the floor everywhere plus the points she gets to spend", () => {
  // Asserted as a relationship rather than a number, so the two can never drift
  // apart. Pin the literal instead and the next change to either one silently
  // makes every character in the game better or worse at everything — which is
  // exactly what happened the last time this was a literal.
  assert.equal(STAT_BUDGET, STATS.length * STAT_MIN + POINTS_TO_SPEND);

  // And the shape it buys: three stats at the cap, or a spread, and nothing in
  // between is out of reach.
  assert.deepEqual(
    validateStats(statBlock({ might: 5, wits: 5, heart: 5, spark: 1, grace: 1, luck: 1, grit: 1 })),
    { ok: true },
  );
});

test("a freshly opened builder has all twelve still to spend", () => {
  // What the girls actually see when they start. The floor in everything, and
  // nothing allocated — the builder used to open with the whole budget already
  // spread across seven stats, which made the only interesting move taking
  // points away from things.
  const untouched = Object.fromEntries(STATS.map((stat) => [stat, STAT_MIN])) as StatBlock;

  assert.equal(pointsRemaining(untouched), POINTS_TO_SPEND);
  assert.equal(validateStats(untouched).ok, false);
});

// ---- Relationships ---------------------------------------------------------

test("reciprocal roles invert correctly", () => {
  assert.equal(reciprocalOf("PARENT"), "CHILD");
  assert.equal(reciprocalOf("CHILD"), "PARENT");
  assert.equal(reciprocalOf("GRANDPARENT"), "GRANDCHILD");
  assert.equal(reciprocalOf("SIBLING"), "SIBLING");
  assert.equal(reciprocalOf("FRIEND"), "FRIEND");
});

test("symmetric roles are their own reciprocal", () => {
  for (const kind of ["SIBLING", "FRIEND"] as const) {
    assert.equal(reciprocalOf(reciprocalOf(kind)), kind);
  }
});

test("canonical ordering is stable whichever way the pair is given", () => {
  const forward = canonicalPair("aaa", "bbb", "PARENT");
  const backward = canonicalPair("bbb", "aaa", "CHILD");

  // Both describe the same fact and must produce an identical row.
  assert.deepEqual(forward, backward);
  assert.equal(forward.characterAId, "aaa");
  assert.equal(forward.aToB, "PARENT");
});

test("canonical ordering flips the kind when it swaps the pair", () => {
  const row = canonicalPair("zzz", "aaa", "PARENT");
  assert.equal(row.characterAId, "aaa");
  assert.equal(row.characterBId, "zzz");
  // zzz is the parent of aaa, so stored from aaa's side it becomes CHILD.
  assert.equal(row.aToB, "CHILD");
});

test("each side reads the relationship from its own perspective", () => {
  const row = canonicalPair("aaa", "bbb", "PARENT");
  assert.equal(kindFromPerspective(row, "aaa"), "PARENT");
  assert.equal(kindFromPerspective(row, "bbb"), "CHILD");
});

// ---- Bonds and levels ------------------------------------------------------

test("bonds start at zero and climb with shared moments", () => {
  assert.equal(bondLevelFor(0), 0);
  assert.equal(bondLevelFor(2), 0);
  assert.equal(bondLevelFor(3), 1);
  assert.equal(bondLevelFor(8), 2);
  assert.equal(bondLevelFor(1000), 5);
});

test("bond progress reports position within the current level", () => {
  assert.deepEqual(bondProgress(0), { level: 0, into: 0, needed: 3 });
  assert.deepEqual(bondProgress(5), { level: 1, into: 2, needed: 5 });
  // At the cap there is nothing left to earn.
  assert.deepEqual(bondProgress(1000), { level: 5, into: 0, needed: null });
});

test("level progress reports position within the current level", () => {
  // Level 1 spans 0..9, level 2 starts at 10.
  assert.deepEqual(levelProgress(0), { level: 1, into: 0, needed: 10 });
  assert.deepEqual(levelProgress(7), { level: 1, into: 7, needed: 10 });
  // Level 2 spans 10..24.
  assert.deepEqual(levelProgress(10), { level: 2, into: 0, needed: 15 });
  assert.deepEqual(levelProgress(20), { level: 2, into: 10, needed: 15 });
});

test("level progress reports no further to go at the cap", () => {
  const capped = levelProgress(10_000);
  assert.equal(capped.level, MAX_LEVEL);
  assert.equal(capped.needed, null, "a capped character must not show a bar that never moves");
});

test("progress never exceeds the level it belongs to", () => {
  for (let xp = 0; xp <= 700; xp += 1) {
    const { level, into, needed } = levelProgress(xp);
    assert.equal(level, levelFor(xp), `level disagreed at xp=${xp}`);
    if (needed !== null) {
      assert.ok(into >= 0 && into < needed, `xp=${xp} gave into=${into} of ${needed}`);
    }
  }
});

test("the catalogue keeps the last level-ups honest", () => {
  // Two failure modes, one on each side.
  //
  // Catalogue much bigger than the ladder: most of it is decoration nobody can
  // ever hold. Catalogue equal to the ladder — the old rule here — is subtler
  // and worse: by the last few levels she takes whatever is left, so the picks
  // that should feel most earned are the only ones that are not choices at all.
  //
  // So the catalogue runs a little past the ladder. A full-career character
  // holds twelve of fifteen, and even her final pick is three-from-a-shortlist.
  const earned = knacksEarned(MAX_LEVEL);
  assert.ok(KNACKS.length > earned, "the last pick is not a choice");
  assert.ok(
    KNACKS.length - earned <= 4,
    `${KNACKS.length - earned} knacks can never all be held — that is a shelf, not a margin`,
  );
});

test("the ladder outlasts filling the stat sheet", () => {
  // Four stats from the build cap to the ceiling, at ten xp a point. Levelling
  // must not finish first, or there is a stretch where xp buys a stat point
  // with nothing to announce, and then a cliff where it buys nothing at all.
  const toFillTheSheet = 4 * (STAT_CEILING - STAT_MAX) * XP_PER_STAT_POINT;
  assert.ok(
    levelFor(toFillTheSheet) < MAX_LEVEL,
    `levelling ended at ${toFillTheSheet} xp, before the stats did`,
  );
});

test("levels always cost more than the one before", () => {
  let previous = 0;
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    const step = xpForLevel(level) - xpForLevel(level - 1);
    assert.ok(step > previous, `level ${level} cost ${step}, no more than the ${previous} before it`);
    previous = step;
  }
});

test("room to learn opens twice on the way up, and stacks with Fast Learner", () => {
  // What she may have chosen: two at the builder, then one per level from the
  // third. The middle two are the numbers the girls were promised.
  assert.equal(chosenSkillsFor(1), 2);
  assert.equal(chosenSkillsFor(2), 2);
  assert.equal(chosenSkillsFor(3), 3);
  assert.equal(chosenSkillsFor(4), 4);
  assert.equal(chosenSkillsFor(MAX_LEVEL), 2 + MAX_LEVEL - 2);

  // And the room always sits above it, so a skill she earned by doing it four
  // times never has to displace one she chose.
  for (const level of [1, 3, 4, 6, MAX_LEVEL]) {
    assert.ok(skillRoom(level) > chosenSkillsFor(level), `no headroom at level ${level}`);
  }
  assert.equal(skillRoom(4, 2), skillRoom(4) + 2, "Fast Learner stopped adding");

  // The knack has to stay worth choosing at every level, so the two add up
  // rather than one quietly absorbing the other.
  assert.equal(skillRoom(11, extraSkillRoom(["fast_learner"])), skillRoom(11) + 2);
});

test("character levels rise with experience", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(9), 1);
  assert.equal(levelFor(10), 2);
  assert.equal(levelFor(25), 3);
  assert.equal(levelFor(10_000), MAX_LEVEL);
});

// ---- Skill growth ----------------------------------------------------------

test("skills rank up with use", () => {
  assert.equal(skillRankFor(0), 1);
  assert.equal(skillRankFor(5), 1);
  assert.equal(skillRankFor(6), 2);
  assert.equal(skillRankFor(16), 3);
  assert.equal(skillRankFor(1000), 4);
});

test("skill progress reports position within the rank", () => {
  assert.deepEqual(skillProgress(0), { rank: 1, into: 0, needed: 6 });
  assert.deepEqual(skillProgress(8), { rank: 2, into: 2, needed: 10 });
  assert.deepEqual(skillProgress(1000), { rank: 4, into: 0, needed: null });
});

// ---- Family Moves ----------------------------------------------------------

test("a bond of zero unlocks nothing", () => {
  assert.deepEqual(movesUnlockedAt(0), []);
});

test("moves unlock cumulatively as a bond deepens", () => {
  assert.equal(movesUnlockedAt(1).length, 1);
  assert.equal(movesUnlockedAt(3).length, 3);
  assert.equal(movesUnlockedAt(5).length, 5);
});

test("crossing a bond level reports only the newly unlocked moves", () => {
  const gained = movesUnlockedBetween(1, 3);
  assert.equal(gained.length, 2);
  assert.deepEqual(gained.map((move) => move.requires), [2, 3]);
});

test("a bond that did not change unlocks nothing new", () => {
  assert.deepEqual(movesUnlockedBetween(2, 2), []);
});

test("every move needs a bond, so none can be used alone", () => {
  for (const move of movesUnlockedAt(5)) {
    assert.ok(move.requires >= 1, `${move.key} would be usable with no bond at all`);
  }
});

// ---- Act advancement -------------------------------------------------------
//
// Extracted from lib/engine/play.ts, where the same expression decides whether
// an adventure moves on or ends. The original compared against `acts.length`
// rather than the last index, so completing the final act advanced to an index
// that did not exist — and the context builder's `?? acts[0]` fallback then
// steered the story back to its opening act. An adventure could not end; it
// looped, and nothing ever set the COMPLETE status.

function actTransition(currentActIndex: number, actCount: number, actComplete: boolean) {
  const isFinalAct = currentActIndex >= actCount - 1;
  return { advances: actComplete && !isFinalAct, finishes: actComplete && isFinalAct };
}

test("a completed middle act moves the story on", () => {
  assert.deepEqual(actTransition(0, 3, true), { advances: true, finishes: false });
  assert.deepEqual(actTransition(1, 3, true), { advances: true, finishes: false });
});

test("completing the final act ends the adventure instead of advancing", () => {
  assert.deepEqual(actTransition(2, 3, true), { advances: false, finishes: true });
});

test("an act that is not finished changes nothing", () => {
  assert.deepEqual(actTransition(0, 3, false), { advances: false, finishes: false });
  assert.deepEqual(actTransition(2, 3, false), { advances: false, finishes: false });
});

test("advancing never points past the last act", () => {
  // The property that actually matters: whatever the act count, the index
  // handed to the context builder must always resolve to a real act.
  for (let actCount = 1; actCount <= 6; actCount += 1) {
    for (let index = 0; index < actCount; index += 1) {
      const { advances } = actTransition(index, actCount, true);
      const next = advances ? index + 1 : index;
      assert.ok(
        next < actCount,
        `act ${index} of ${actCount} advanced to ${next}, which does not exist`,
      );
    }
  }
});

test("a single-act storyline ends rather than looping", () => {
  assert.deepEqual(actTransition(0, 1, true), { advances: false, finishes: true });
});
