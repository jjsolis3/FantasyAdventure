import assert from "node:assert/strict";
import test from "node:test";
import { describeResult, resolveCheck } from "../lib/engine/dice.ts";
import {
  LUCK_NUDGE_STEP,
  NEUTRAL_STAT,
  STATS,
  STAT_CEILING,
  STAT_MAX,
  luckChance,
  luckOdds,
  statBlock,
  statModifier,
} from "../lib/game/rules.ts";

// ---- The curve -------------------------------------------------------------

test("ordinary luck bends nothing", () => {
  // The hinge the whole design turns on: a character who spread her points
  // evenly has no hidden thumb on the scale, exactly as she has no modifier.
  assert.equal(statModifier(NEUTRAL_STAT), 0);
  assert.equal(luckChance(NEUTRAL_STAT), 0);
});

test("bad luck is never punished, only unhelped", () => {
  // statModifier(1) is −2, and a negative chance would have to mean something.
  // Clamped, so the dice are not additionally cruel to a child who spent her
  // points elsewhere.
  for (const value of [1, 2]) {
    assert.ok(statModifier(value) < 0, `expected ${value} to roll at a penalty`);
    assert.equal(luckChance(value), 0);
  }
});

test("every point above neutral buys the same step, up to the build cap", () => {
  assert.equal(luckChance(4), LUCK_NUDGE_STEP);
  assert.equal(luckChance(STAT_MAX), 2 * LUCK_NUDGE_STEP);
});

test("the nudge flattens exactly where rolls flatten", () => {
  // Not asserted as numbers, deliberately. The claim worth protecting is that
  // Luck rides statModifier's curve rather than carrying one of its own — so if
  // that curve is ever retuned, this keeps the two in step instead of quietly
  // disagreeing.
  for (let value = 1; value <= STAT_CEILING; value += 1) {
    assert.equal(luckChance(value), Math.max(0, statModifier(value)) * LUCK_NUDGE_STEP);
  }

  // And the consequence of riding it: two points buy one step past 5.
  assert.equal(luckChance(6), luckChance(7));
  assert.equal(luckChance(8), luckChance(9));
});

test("a whole career of Luck still leaves the dice in charge", () => {
  // Under half. A character at the ceiling has spent ninety experience on this
  // and is still likelier than not to wear a bad roll.
  assert.ok(luckChance(STAT_CEILING) < 50, `${luckChance(STAT_CEILING)}% is too much`);
});

test("the odds are stated in something a child can picture", () => {
  assert.match(luckOdds(NEUTRAL_STAT), /nothing bends/);
  assert.equal(luckOdds(STAT_MAX), "fortune steps in about 1 time in 6");
});

// ---- The stat that was not there -------------------------------------------

test("a stat that never arrived rolls as an ordinary one", () => {
  // The bug this is named after: a four-key stat literal with a cast survived
  // the move to seven stats, so Grace, Luck and Grit reached the dice as
  // undefined. NaN loses every comparison, which made those checks automatic
  // complications — the worst kind of bug, because the card showed a good roll
  // and a bad result and gave no reason.
  assert.equal(statModifier(undefined as unknown as number), 0);
  assert.equal(statModifier(Number.NaN), 0);
  assert.equal(luckChance(undefined as unknown as number), 0);
});

test("every stat resolves to a real number, whichever one is checked", () => {
  const complete = statBlock();
  for (const stat of STATS) {
    const result = resolveCheck(
      { characterId: "c", characterName: "Mira", stat, difficulty: "NORMAL", intent: "try it" },
      complete,
      () => 14,
    );
    assert.ok(Number.isFinite(result.total), `${stat} produced ${result.total}`);
    assert.equal(result.outcome, "SUCCESS");
  }
});

// ---- What it does to a roll ------------------------------------------------

const request = {
  characterId: "c",
  characterName: "Mira",
  stat: "wits" as const,
  difficulty: "NORMAL" as const,
  intent: "work out which board is loose",
};

/** Lucky and unlucky percentile dice, so no test here depends on chance. */
const fortune = () => 1;
const nothing = () => 100;

const lucky = statBlock({ luck: STAT_MAX });
const ordinary = statBlock();

test("a near miss turns out fine after all", () => {
  // Rolled 10 against 12: missed by two, which is a PARTIAL.
  const result = resolveCheck(request, lucky, () => 10, undefined, undefined, fortune);

  assert.equal(result.outcome, "SUCCESS");
  assert.equal(result.luck?.from, "PARTIAL");
  // The numbers are left honest. She really did roll a 10 against a 12, and the
  // card says so — the lucky break is an extra line, not a rewritten total.
  assert.equal(result.roll, 10);
  assert.equal(result.total, 10);
});

test("a bad miss goes wrong, but not as wrong as it should have", () => {
  const result = resolveCheck(request, lucky, () => 5, undefined, undefined, fortune);

  assert.equal(result.outcome, "PARTIAL");
  assert.equal(result.luck?.from, "COMPLICATION");
});

test("luck lifts one step and never two", () => {
  // The failure this guards against is a COMPLICATION arriving as a SUCCESS,
  // which would make a badly-rolled check indistinguishable from a good one.
  const result = resolveCheck(request, lucky, () => 5, undefined, undefined, fortune);
  assert.notEqual(result.outcome, "SUCCESS");
});

test("luck never hands out a critical", () => {
  // A natural 20 is the best thirty seconds in the game and it belongs to the
  // die. Nothing that happens by chance may print that word.
  const result = resolveCheck(request, lucky, () => 12, undefined, undefined, fortune);
  assert.equal(result.outcome, "SUCCESS");
  assert.equal(result.luck, undefined);
});

test("nothing saves a 1", () => {
  const result = resolveCheck(request, lucky, () => 1, undefined, undefined, fortune);
  assert.equal(result.outcome, "COMPLICATION");
  assert.equal(result.luck, undefined);
});

test("a roll that already succeeded is left alone", () => {
  const result = resolveCheck(request, lucky, () => 14, undefined, undefined, fortune);
  assert.equal(result.outcome, "SUCCESS");
  assert.equal(result.luck, undefined);
});

test("an ordinary adventurer is never lifted, however the chance falls", () => {
  // The lowest possible percentile roll against a zero chance. If this ever
  // fires, `1 <= 0` has become true and every character in the house is lucky.
  const result = resolveCheck(request, ordinary, () => 10, undefined, undefined, fortune);
  assert.equal(result.outcome, "PARTIAL");
  assert.equal(result.luck, undefined);
});

test("a lucky adventurer whose luck does not come in wears the miss", () => {
  const result = resolveCheck(request, lucky, () => 10, undefined, undefined, nothing);
  assert.equal(result.outcome, "PARTIAL");
  assert.equal(result.luck, undefined);
});

test("what she spent herself is what saved her, not luck", () => {
  // A girl who has been holding on to her signature move all evening must not
  // be told afterwards that she got lucky instead. The ability succeeds first,
  // so there is nothing left for luck to lift.
  const result = resolveCheck(
    request,
    lucky,
    () => 5,
    undefined,
    { own: { name: "Steady Hand", effect: { kind: "AUTO_SUCCEED" } } },
    fortune,
  );

  assert.equal(result.outcome, "SUCCESS");
  assert.equal(result.luck, undefined);
  assert.match(result.ability?.note ?? "", /Steady Hand/);
});

test("a sister's help is what saved her, not luck", () => {
  const result = resolveCheck(
    request,
    lucky,
    () => 10,
    { key: "two_as_one", moveName: "Two as One", helperName: "Rowan" },
    undefined,
    fortune,
  );

  assert.equal(result.outcome, "SUCCESS");
  assert.equal(result.luck, undefined);
});

test("luck still catches a miss the family move could not", () => {
  // Lend a Hand adds 2 to a roll of 5 against 12: still short by five, so the
  // move fired, did its job, and was not enough. This is the case where both
  // land on one check, and it is the one that proves the ordering is a fallback
  // rather than a race.
  const result = resolveCheck(
    request,
    lucky,
    () => 5,
    { key: "lend_a_hand", moveName: "Lend a Hand", helperName: "Rowan" },
    undefined,
    fortune,
  );

  assert.equal(result.move?.note, "Rowan lends a hand: +2");
  assert.equal(result.luck?.from, "COMPLICATION");
  assert.equal(result.outcome, "PARTIAL");
});

// ---- Saying so -------------------------------------------------------------

test("the storyteller is told to narrate the world, not the girl", () => {
  const result = resolveCheck(request, lucky, () => 10, undefined, undefined, fortune);
  const told = describeResult(result);

  assert.match(told, /LUCK/);
  assert.match(told, /heading for PARTIAL/);
  // The whole reason the line exists: told only the outcome, a model writes
  // Mira cleverly pulling off the thing she actually fumbled.
  assert.match(told, /not Mira being clever or strong/);
});

test("an ordinary check says nothing about luck at all", () => {
  const result = resolveCheck(request, ordinary, () => 14);
  assert.doesNotMatch(describeResult(result), /LUCK/);
});
