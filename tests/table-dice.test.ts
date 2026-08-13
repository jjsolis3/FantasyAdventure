import assert from "node:assert/strict";
import test from "node:test";
import { TABLE_DIE, checkRolls, rollerFrom, type AwaitedRoll } from "../lib/game/table-dice.ts";
import { resolveCheck } from "../lib/engine/dice.ts";
import { statBlock } from "../lib/game/rules.ts";

const awaited: AwaitedRoll[] = [
  {
    index: 0,
    characterId: "c-mira",
    characterName: "Mira",
    intent: "reach the latch",
    stat: "grace",
    difficulty: "NORMAL",
  },
  {
    index: 1,
    characterId: "c-rowan",
    characterName: "Rowan",
    intent: "hold the gate",
    stat: "might",
    difficulty: "NORMAL",
  },
];

// ---- What may be typed ------------------------------------------------------

test("two numbers off two dice", () => {
  const verdict = checkRolls(awaited, [
    { index: 0, value: 14 },
    { index: 1, value: 3 },
  ]);

  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ok && verdict.values, [14, 3]);
});

test("the values come back in the order the checks will be asked for", () => {
  // The worst bug available here, and the reason this is sorted rather than
  // trusted: hand the right numbers back in the wrong order and nothing errors,
  // every check resolves, and the girl who rolled a 19 watches somebody else
  // succeed with it.
  const verdict = checkRolls(awaited, [
    { index: 1, value: 3 },
    { index: 0, value: 14 },
  ]);

  assert.deepEqual(verdict.ok && verdict.values, [14, 3]);
});

test("a d6 grabbed by mistake is caught", () => {
  const verdict = checkRolls(awaited, [
    { index: 0, value: 21 },
    { index: 1, value: 3 },
  ]);

  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /right one/i);
});

test("a die shows a whole number, and at least one", () => {
  for (const value of [0, -3, 1.5]) {
    const verdict = checkRolls(awaited, [
      { index: 0, value },
      { index: 1, value: 3 },
    ]);
    assert.equal(verdict.ok, false, `${value} should not be accepted`);
  }
});

test("the turn waits until everybody has rolled", () => {
  const verdict = checkRolls(awaited, [{ index: 0, value: 14 }]);

  assert.equal(verdict.ok, false);
  // Named, because "incomplete" tells a table nothing and "still waiting on
  // Rowan" makes somebody look up.
  assert.match(verdict.ok === false ? verdict.reason : "", /Rowan/);
});

test("both names are given when both are missing", () => {
  const verdict = checkRolls(awaited, []);
  assert.match(verdict.ok === false ? verdict.reason : "", /Mira, Rowan/);
});

test("correcting a typo is not an error", () => {
  // She typed 4, meant 14, and typed again before pressing send. Telling her off
  // for that would be the pettiest thing this app could do.
  const verdict = checkRolls(awaited, [
    { index: 0, value: 4 },
    { index: 0, value: 14 },
    { index: 1, value: 3 },
  ]);

  assert.deepEqual(verdict.ok && verdict.values, [14, 3]);
});

test("a roll nobody asked for is refused", () => {
  const verdict = checkRolls(awaited, [
    { index: 0, value: 14 },
    { index: 1, value: 3 },
    { index: 7, value: 20 },
  ]);
  assert.equal(verdict.ok, false);
});

test("nothing is waiting means nothing to send", () => {
  assert.equal(checkRolls([], [{ index: 0, value: 12 }]).ok, false);
});

// ---- Handing them to the dice ----------------------------------------------

test("the numbers reach the checks, in order", () => {
  const roller = rollerFrom([14, 3], () => 20);
  assert.equal(roller(), 14);
  assert.equal(roller(), 3);
});

test("asking for more than were typed falls back to a fair roll", () => {
  // Should be impossible — the checks were counted before the table was asked.
  // "Impossible" here would be a turn dying halfway with four people watching,
  // and an unexpected fair roll is a far better outcome than a crash.
  const roller = rollerFrom([14], () => 11);
  assert.equal(roller(), 14);
  assert.equal(roller(), 11);
});

test("a typed number is a roll like any other", () => {
  // The whole reason this feature needed no change to how a check resolves: the
  // dice do not care where a number came from, so every modifier, skill, shared
  // plan and lucky break still applies.
  const request = {
    characterId: "c",
    characterName: "Mira",
    stat: "grace" as const,
    difficulty: "NORMAL" as const,
    intent: "reach the latch",
    skillRank: 2,
    skillName: "Climbing",
    together: { with: "Rowan", bonus: 1 },
  };

  const roller = rollerFrom([11], () => 1);
  const result = resolveCheck(request, statBlock({ grace: 5 }), roller);

  assert.equal(result.roll, 11);
  // 11 + 2 (Grace 5) + 2 (skill) + 1 (together) = 16, against NORMAL's 12.
  assert.equal(result.total, 16);
  // Four over is a success and not a critical — five is the line. Worth
  // asserting the outcome rather than only the total: the total proves the
  // modifiers were added, and this proves a hand-typed number goes through the
  // same thresholds as one the server threw.
  assert.equal(result.outcome, "SUCCESS");
});

test("the die this game asks for is the one in every set", () => {
  assert.equal(TABLE_DIE, 20);
});
