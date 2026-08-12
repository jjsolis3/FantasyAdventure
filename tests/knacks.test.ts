import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  KNACKS,
  KNACKS_OFFERED,
  affinity,
  extraSkillRoom,
  extraSupplies,
  knackBonusFor,
  knackByKey,
  knacksEarned,
  knacksUnspent,
  narrativeHints,
  offerFor,
  type OfferInput,
} from "../lib/game/knacks.ts";
import { statBlock, statModifier } from "../lib/game/rules.ts";
import { resolveCheck } from "../lib/engine/dice.ts";

const even = statBlock({ might: 3, wits: 3, heart: 3, spark: 3 });

function offer(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    characterId: "wren",
    level: 3,
    stats: even,
    practices: [],
    taken: [],
    ...overrides,
  };
}

// ---- What a level buys ------------------------------------------------------

test("knacks: level one buys nothing, and every level after buys one", () => {
  // Level 1 is who she was built as. Everything after it is who she became.
  assert.equal(knacksEarned(1), 0);
  assert.equal(knacksEarned(2), 1);
  assert.equal(knacksEarned(9), 8);
});

test("knacks: what is left is what she has not taken", () => {
  assert.equal(knacksUnspent(4, 0), 3);
  assert.equal(knacksUnspent(4, 3), 0);
});

test("knacks: undoing a level cannot leave her owing one", () => {
  // Taking a turn back restores xp and level; she may briefly hold more than
  // she has earned, and that must read as none left rather than a negative.
  assert.equal(knacksUnspent(2, 5), 0);
});

// ---- The offer --------------------------------------------------------------

test("knacks: three are offered", () => {
  assert.equal(offerFor(offer()).length, KNACKS_OFFERED);
});

test("knacks: the same character is offered the same three every time", () => {
  // An offer that reshuffled on refresh would let a girl reroll until she liked
  // it, which turns a decision into a slot machine.
  const first = offerFor(offer()).map((knack) => knack.key);
  const again = offerFor(offer()).map((knack) => knack.key);

  assert.deepEqual(first, again);
});

test("knacks: two different girls are offered different things", () => {
  const climber = offer({
    characterId: "a",
    stats: statBlock({ might: 8, wits: 3, heart: 3, spark: 3 }),
    practices: [{ key: "climb", attempts: 6 }],
  });
  const talker = offer({
    characterId: "b",
    stats: statBlock({ might: 3, wits: 3, heart: 8, spark: 3 }),
    practices: [{ key: "persuad", attempts: 6 }],
  });

  const forClimber = offerFor(climber).map((knack) => knack.key);
  const forTalker = offerFor(talker).map((knack) => knack.key);

  assert.notDeepEqual(forClimber, forTalker);
  assert.ok(forClimber.includes("sure_footed"), forClimber.join(", "));
  assert.ok(forTalker.includes("warm_word"), forTalker.join(", "));
});

test("knacks: what she has been doing counts for more than how she was built", () => {
  // A high stat says how she was made; four attempts at sneaking says what she
  // has been doing, and the second is the more specific claim.
  const sneaky = offer({
    stats: statBlock({ might: 9, wits: 3, heart: 3, spark: 3 }),
    practices: [{ key: "sneak", attempts: 5 }],
  });

  assert.ok(
    affinity(knackByKey("light_step")!, sneaky) > affinity(knackByKey("sure_footed")!, sneaky),
  );
});

test("knacks: the level changes the wildcard", () => {
  // She should not be shown the identical three every level for ever.
  const atThree = offerFor(offer({ level: 3 })).map((knack) => knack.key);
  const atFour = offerFor(offer({ level: 4 })).map((knack) => knack.key);

  assert.notDeepEqual(atThree, atFour);
});

test("knacks: nothing she already has is offered again", () => {
  const taken = ["sure_footed", "quick_eye", "warm_word"];
  const offered = offerFor(offer({ taken })).map((knack) => knack.key);

  for (const key of taken) assert.ok(!offered.includes(key), key);
});

test("knacks: the offer never repeats itself within one list", () => {
  const offered = offerFor(offer({ practices: [{ key: "climb", attempts: 9 }] }));
  assert.equal(new Set(offered.map((knack) => knack.key)).size, offered.length);
});

test("knacks: running out gracefully offers whatever is left", () => {
  const nearlyAll = KNACKS.slice(0, KNACKS.length - 2).map((knack) => knack.key);
  const offered = offerFor(offer({ taken: nearlyAll }));

  assert.equal(offered.length, 2);
});

test("knacks: every one of them is worth having", () => {
  // None is a trap, so a seven-year-old cannot choose badly here.
  for (const knack of KNACKS) {
    assert.ok(knack.blurb.length > 20, knack.key);
    assert.ok(knack.name.length > 2, knack.key);
    assert.ok(
      knack.drawnFrom.stat !== undefined || (knack.drawnFrom.practice ?? []).length > 0,
      `${knack.key} can never be earned by anything`,
    );
  }
});

test("knacks: keys are unique", () => {
  assert.equal(new Set(KNACKS.map((knack) => knack.key)).size, KNACKS.length);
});

// ---- What they do -----------------------------------------------------------

test("knacks: a bonus reaches the right stat and no other", () => {
  assert.equal(knackBonusFor(["sure_footed"], "might"), 1);
  assert.equal(knackBonusFor(["sure_footed"], "wits"), 0);
  assert.equal(knackBonusFor([], "might"), 0);
});

test("knacks: a bonus is really applied to the roll", () => {
  // The point of the whole feature: this has to change a die, not a description.
  const request = {
    characterId: "c1",
    characterName: "Wren",
    stat: "might" as const,
    difficulty: "NORMAL" as const,
    intent: "shove the door",
    knackBonus: 1,
  };

  const rolled = resolveCheck(request, even, () => 10);
  assert.equal(rolled.modifier, statModifier(3) + 1);
  assert.equal(rolled.total, 10 + statModifier(3) + 1);
});

test("knacks: a character without it rolls exactly as before", () => {
  const request = {
    characterId: "c1",
    characterName: "Wren",
    stat: "might" as const,
    difficulty: "NORMAL" as const,
    intent: "shove the door",
  };

  assert.equal(resolveCheck(request, even, () => 10).total, 10 + statModifier(3));
});

test("knacks: an unknown key does nothing rather than crashing", () => {
  // A knack removed from the catalogue leaves rows behind in the database.
  assert.equal(knackBonusFor(["a_knack_that_was_deleted"], "might"), 0);
  assert.deepEqual(narrativeHints(["a_knack_that_was_deleted"]), []);
  assert.equal(extraSupplies(["a_knack_that_was_deleted"]), 0);
});

test("knacks: Deep Pockets is one more thing at packing", () => {
  assert.equal(extraSupplies(["deep_pockets"]), 1);
  assert.equal(extraSupplies([]), 0);
});

test("knacks: Fast Learner widens the sheet", () => {
  assert.equal(extraSkillRoom(["fast_learner"]), 2);
  assert.equal(extraSkillRoom([]), 0);
});

test("knacks: the storyteller is told only what it has to honour", () => {
  // A pure number is already in the dice; repeating it would crowd the prompt.
  assert.deepEqual(narrativeHints(["sure_footed"]), []);

  const hints = narrativeHints(["good_listener"]);
  assert.equal(hints.length, 1);
  assert.match(hints[0], /Good Listener/);
});

test("knacks: every narrative knack actually tells the storyteller something", () => {
  for (const knack of KNACKS) {
    if (knack.effect.kind !== "NARRATIVE") continue;
    assert.ok(knack.narrationHint, `${knack.key} would do nothing at all`);
    assert.ok(knack.narrationHint!.length > 40, knack.key);
  }
});
