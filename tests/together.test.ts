import assert from "node:assert/strict";
import test from "node:test";
import {
  TOGETHER_BONUS,
  namesOf,
  pairsIn,
  planFor,
  resolvePlans,
  togetherGuidance,
} from "../lib/game/together.ts";
import { resolveCheck } from "../lib/engine/dice.ts";
import { describeResult } from "../lib/engine/dice.ts";
import { statBlock, moveNamesFor, flavourOf, FAMILY_MOVES, RELATIONSHIP_KINDS } from "../lib/game/rules.ts";

const party = [
  { characterId: "c-mira", name: "Mira" },
  { characterId: "c-rowan", name: "Rowan" },
  { characterId: "c-bo", name: "Bo" },
];

// ---- Reading a claim --------------------------------------------------------

test("two people on one plan is a plan", () => {
  const plans = resolvePlans([{ characters: ["Mira", "Rowan"], plan: "boost her to the latch" }], party);

  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].characterIds.sort(), ["c-mira", "c-rowan"]);
  assert.equal(plans[0].plan, "boost her to the latch");
});

test("one person is not a team, however it is worded", () => {
  assert.deepEqual(resolvePlans([{ characters: ["Mira"], plan: "does it alone" }], party), []);
});

test("the same girl named twice is still one girl", () => {
  // A small model repeating a name is the cheapest way to invent a teammate out
  // of nobody, and it would pay her a bonus for working with herself.
  assert.deepEqual(resolvePlans([{ characters: ["Mira", "Mira"], plan: "hmm" }], party), []);
});

test("somebody who is not at this table is dropped, and the rest still counts", () => {
  const plans = resolvePlans(
    [{ characters: ["Mira", "Rowan", "Aunt Prudence"], plan: "three ways at once" }],
    party,
  );

  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].names, ["Mira", "Rowan"]);
});

test("an invented cousin does not cost the table its plan", () => {
  // Dropped rather than rejected. The storyteller hallucinating one name should
  // never be the reason two real children lose the thing they earned.
  const plans = resolvePlans([{ characters: ["Mira", "Nobody"], plan: "…" }], party);
  assert.deepEqual(plans, []);
});

test("the same pairing twice in one turn is one plan", () => {
  const plans = resolvePlans(
    [
      { characters: ["Mira", "Rowan"], plan: "hold the gate" },
      { characters: ["Rowan", "Mira"], plan: "hold the gate, again" },
    ],
    party,
  );

  assert.equal(plans.length, 1, "a pair must not be paid twice for one idea");
});

test("names are matched however they are cased or padded", () => {
  const plans = resolvePlans([{ characters: [" mira ", "ROWAN"], plan: "x" }], party);
  assert.equal(plans.length, 1);
});

// ---- What a plan is made of -------------------------------------------------

test("every pair in a plan is found, once each", () => {
  const [plan] = resolvePlans([{ characters: ["Mira", "Rowan", "Bo"], plan: "x" }], party);
  const pairs = pairsIn(plan);

  assert.equal(pairs.length, 3, "three people make three pairs");
  const keys = pairs.map(([a, b]) => [a, b].sort().join("|"));
  assert.equal(new Set(keys).size, 3);
});

test("a pair makes exactly one pair", () => {
  const [plan] = resolvePlans([{ characters: ["Mira", "Rowan"], plan: "x" }], party);
  assert.equal(pairsIn(plan).length, 1);
});

test("names read the way a person would say them", () => {
  const [two] = resolvePlans([{ characters: ["Mira", "Rowan"], plan: "x" }], party);
  assert.equal(namesOf(two), "Mira and Rowan");

  const [three] = resolvePlans([{ characters: ["Mira", "Rowan", "Bo"], plan: "x" }], party);
  assert.equal(namesOf(three), "Mira, Rowan and Bo");
});

test("a character not in any plan has none", () => {
  const plans = resolvePlans([{ characters: ["Mira", "Rowan"], plan: "x" }], party);
  assert.equal(planFor(plans, "c-bo"), undefined);
  assert.notEqual(planFor(plans, "c-mira"), undefined);
});

// ---- What it is worth -------------------------------------------------------

const request = {
  characterId: "c-mira",
  characterName: "Mira",
  stat: "grace" as const,
  difficulty: "NORMAL" as const,
  intent: "reach the latch",
};

test("working together lifts the roll", () => {
  const alone = resolveCheck(request, statBlock(), () => 11);
  const shared = resolveCheck(
    { ...request, together: { with: "Rowan", bonus: TOGETHER_BONUS } },
    statBlock(),
    () => 11,
  );

  assert.equal(shared.total - alone.total, TOGETHER_BONUS);
});

test("it is smaller than a move that has to be earned and spent", () => {
  // Lend a Hand is +2, unlocked by a bond and gone for the rest of the scene.
  // This is free, repeatable and available on the first evening — if it paid
  // the same, the moves a family works up to would be worth less than the thing
  // anybody can do for nothing.
  const lendAHand = FAMILY_MOVES.find((move) => move.key === "lend_a_hand");
  assert.ok(lendAHand);
  assert.ok(TOGETHER_BONUS < 2, `${TOGETHER_BONUS} must not match a spent move`);
});

test("a shared plan and a spent move add up rather than replacing each other", () => {
  const both = resolveCheck(
    { ...request, together: { with: "Rowan", bonus: TOGETHER_BONUS } },
    statBlock(),
    () => 9,
    { key: "lend_a_hand", moveName: "Shove Over", helperName: "Rowan" },
  );

  // 9 + 0 modifier + 2 from the move + 1 from the plan.
  assert.equal(both.total, 9 + 2 + TOGETHER_BONUS);
});

test("the storyteller is told it was one thing two people did", () => {
  const plans = resolvePlans([{ characters: ["Mira", "Rowan"], plan: "boost her up" }], party);
  const told = togetherGuidance(plans);

  assert.match(told, /WORKING TOGETHER/);
  assert.match(told, /Mira and Rowan/);
  // The failure being guarded against: two actions narrated as two things that
  // happened to occur in the same room.
  assert.match(told, /not as two things that happened near each other/i);
});

test("a turn nobody shared says nothing about it", () => {
  assert.equal(togetherGuidance([]), "");
});

test("each roll is also told, so a success is never narrated as done alone", () => {
  const result = resolveCheck(
    { ...request, together: { with: "Rowan", bonus: TOGETHER_BONUS } },
    statBlock(),
    () => 14,
  );

  assert.match(describeResult(result), /TOGETHER — with Rowan/);
  assert.match(describeResult(result), /do not describe it as done alone/i);
});

// ---- Whose move it is -------------------------------------------------------

test("every relationship kind has a flavour", () => {
  for (const kind of RELATIONSHIP_KINDS) {
    assert.ok(flavourOf(kind), kind);
  }
});

test("sisters and a father read differently, and do the same thing", () => {
  const move = FAMILY_MOVES.find((entry) => entry.key === "lend_a_hand")!;

  const sisters = moveNamesFor("SIBLING", move);
  const father = moveNamesFor("PARENT", move);
  const friends = moveNamesFor("FRIEND", move);

  assert.notEqual(sisters.name, father.name);
  assert.notEqual(father.name, friends.name);

  // The mechanics are untouched. This is the line that keeps the flavour purely
  // a matter of words: everything resolves through the key, and a family that
  // renames nothing plays exactly the same game.
  for (const named of [sisters, father, friends]) {
    assert.equal(named.key, move.key);
    assert.equal(named.requires, move.requires);
  }
});

test("every move is named in every flavour", () => {
  // A gap here is silent: the move simply falls back to its plain name, and the
  // one pair who unlocked it wonder why theirs is the boring one.
  for (const kind of RELATIONSHIP_KINDS) {
    for (const move of FAMILY_MOVES) {
      const named = moveNamesFor(kind, move);
      assert.notEqual(
        named.name,
        move.name,
        `${kind} has no name of its own for ${move.key}`,
      );
      assert.ok(named.blurb.length > 0);
      assert.ok(named.narrationHint.length > 0);
    }
  }
});

test("a companion animal is a friend rather than a sibling", () => {
  assert.equal(flavourOf("PET"), flavourOf("FRIEND"));
  assert.notEqual(flavourOf("PET"), flavourOf("SIBLING"));
});

test("a grandparent is the same flavour as a parent", () => {
  assert.equal(flavourOf("GRANDPARENT"), flavourOf("PARENT"));
  assert.equal(flavourOf("GRANDCHILD"), flavourOf("CHILD"));
});
