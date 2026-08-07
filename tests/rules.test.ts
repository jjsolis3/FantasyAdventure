import assert from "node:assert/strict";
import test from "node:test";
import {
  STAT_BUDGET,
  bondLevelFor,
  bondProgress,
  canonicalPair,
  kindFromPerspective,
  levelFor,
  pointsRemaining,
  reciprocalOf,
  statModifier,
  validateStats,
  type StatBlock,
} from "../lib/game/rules.ts";

const balanced: StatBlock = { might: 3, wits: 3, heart: 3, spark: 3 };

test("a balanced spread spends exactly the budget", () => {
  assert.equal(pointsRemaining(balanced), 0);
  assert.deepEqual(validateStats(balanced), { ok: true });
});

test("a specialist spread is legal if it totals the budget", () => {
  const specialist: StatBlock = { might: 5, wits: 4, heart: 2, spark: 1 };
  assert.deepEqual(validateStats(specialist), { ok: true });
});

test("rejects overspending", () => {
  const result = validateStats({ might: 5, wits: 5, heart: 5, spark: 5 });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /too many/);
});

test("rejects underspending", () => {
  const result = validateStats({ might: 1, wits: 1, heart: 1, spark: 1 });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /left to spend/);
});

test("rejects a stat above the maximum even when the total is right", () => {
  // 6 + 3 + 2 + 1 = 12, the correct total, but 6 exceeds the cap.
  const result = validateStats({ might: 6, wits: 3, heart: 2, spark: 1 });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /between/);
});

test("rejects a stat below the minimum even when the total is right", () => {
  const result = validateStats({ might: 5, wits: 5, heart: 2, spark: 0 });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /between/);
});

test("rejects non-integer stats", () => {
  const result = validateStats({ might: 3.5, wits: 3.5, heart: 3, spark: 2 });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /whole number/);
});

test("stat modifiers centre on the average", () => {
  assert.equal(statModifier(3), 0);
  assert.equal(statModifier(5), 2);
  assert.equal(statModifier(1), -2);
});

test("the budget is reachable with every stat inside its bounds", () => {
  assert.equal(STAT_BUDGET, 12);
  assert.deepEqual(validateStats({ might: 5, wits: 5, heart: 1, spark: 1 }), { ok: true });
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

test("character levels rise with experience", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(9), 1);
  assert.equal(levelFor(10), 2);
  assert.equal(levelFor(25), 3);
  assert.equal(levelFor(10_000), 9);
});
