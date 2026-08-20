import assert from "node:assert/strict";
import test from "node:test";
import {
  ENCOUNTER_REACH,
  ENCOUNTER_XP,
  NERVE,
  SOLO_MULTIPLIER,
  encounterAt,
  encounterGuidance,
  endingNote,
  groundAfter,
  payoutFor,
  worldRoll,
} from "../lib/game/encounters.ts";
import { QUEST_XP } from "../lib/game/rules.ts";
import { worthKeeping } from "../lib/game/recap.ts";

// ---- The track --------------------------------------------------------------

test("it starts in the middle, going neither way", () => {
  const state = encounterAt(0);
  assert.equal(state.ground, 0);
  assert.equal(state.over, null);
});

test("both ends are an ending", () => {
  assert.equal(encounterAt(ENCOUNTER_REACH).over, "THROUGH");
  assert.equal(encounterAt(-ENCOUNTER_REACH).over, "TURNED");
});

test("it never runs off either end", () => {
  assert.equal(encounterAt(99).ground, ENCOUNTER_REACH);
  assert.equal(encounterAt(-99).ground, -ENCOUNTER_REACH);
});

test("their successes minus what it pressed, and nothing cleverer", () => {
  // The arithmetic has to be sayable out loud at a table: we got two, it took
  // one, we are one up.
  assert.equal(groundAfter({ ground: 0, outcomes: ["SUCCESS", "SUCCESS"], pressed: 1 }), 1);
  assert.equal(groundAfter({ ground: 1, outcomes: [], pressed: 2 }), -1);
  assert.equal(groundAfter({ ground: 0, outcomes: ["SUCCESS"], pressed: 1 }), 0);
});

test("a brilliant idea is worth two", () => {
  // The only place in this game where a natural 20 does arithmetic rather than
  // narrative, and it earns it: one inspired line genuinely should end a
  // standoff faster than two competent ones.
  assert.equal(groundAfter({ ground: 0, outcomes: ["CRITICAL"], pressed: 0 }), 2);
});

test("trying and half-managing it costs nothing and gains nothing", () => {
  // A partial is not progress out of a standoff — but it is not a penalty
  // either. Nowhere else in this game charges a child for trying, and this is
  // not going to be the first place.
  assert.equal(groundAfter({ ground: 0, outcomes: ["PARTIAL"], pressed: 0 }), 0);
  assert.equal(groundAfter({ ground: 1, outcomes: ["COMPLICATION"], pressed: 0 }), 1);
});

// ---- The world's own roll ---------------------------------------------------

test("it can press, and it can never help", () => {
  // An encounter that rolled badly enough to *assist* them would be a strange
  // thing to narrate, and it would take the sting out of the good rounds.
  for (let roll = 1; roll <= 20; roll += 1) {
    for (const nerve of Object.values(NERVE)) {
      assert.ok(worldRoll(nerve, () => roll).pressed >= 0);
    }
  }
});

test("a fiercer thing presses harder", () => {
  const calm = worldRoll(NERVE.CALM, () => 12);
  const fierce = worldRoll(NERVE.FIERCE, () => 12);
  assert.ok(fierce.pressed >= calm.pressed);
});

test("a poor roll gives them the moment", () => {
  const soft = worldRoll(NERVE.CALM, () => 1);
  assert.equal(soft.pressed, 0);
  assert.match(soft.note, /moment/i);
});

test("what it rolled is always reported, so it can be shown", () => {
  const result = worldRoll(NERVE.TENSE, () => 17);
  assert.equal(result.roll, 17);
  assert.equal(result.nerve, NERVE.TENSE);
  assert.ok(result.note.length > 0);
});

// ---- Alone, or asking for help ---------------------------------------------

test("going it alone pays double, to her, and to nobody else", () => {
  const payout = payoutFor({ helpers: ["mira"], solo: true, soloCharacterId: "mira" });

  assert.deepEqual(payout.shares, [{ characterId: "mira", xp: ENCOUNTER_XP * SOLO_MULTIPLIER }]);
  assert.deepEqual(payout.bondPairs, [], "she turned the help down; there is no bond in that");
});

test("together splits it, and every pair earns a bond", () => {
  const payout = payoutFor({ helpers: ["mira", "rowan"], solo: false });

  assert.equal(payout.shares.length, 2);
  assert.equal(
    payout.shares.reduce((sum, share) => sum + share.xp, 0),
    ENCOUNTER_XP,
    "the pot is the pot; sharing does not create experience",
  );
  assert.deepEqual(payout.bondPairs, [["mira", "rowan"]]);
});

test("the remainder is shared out rather than binned", () => {
  // Five between two is three and two. Two and two, with one quietly dropped,
  // is the kind of arithmetic a ten-year-old notices and resents.
  const payout = payoutFor({ helpers: ["mira", "rowan"], solo: false });
  assert.deepEqual(payout.shares.map((share) => share.xp).sort(), [2, 3]);
});

test("three of them make three bonds", () => {
  const payout = payoutFor({ helpers: ["mira", "rowan", "bo"], solo: false });
  assert.equal(payout.bondPairs.length, 3);
  assert.equal(payout.shares.reduce((sum, share) => sum + share.xp, 0), ENCOUNTER_XP);
});

test("acting alone is not the same as saying you would", () => {
  // The fairness line. If one girl simply happened to be the only one who acted,
  // she gets the ordinary share — not the solo prize for a choice she never
  // made. Otherwise the bigger reward goes to whoever answered quickest, and a
  // shared game becomes a race.
  const payout = payoutFor({ helpers: ["mira"], solo: false });
  assert.deepEqual(payout.shares, [{ characterId: "mira", xp: ENCOUNTER_XP }]);
  assert.deepEqual(payout.bondPairs, []);
});

test("nobody did anything, nobody is paid", () => {
  assert.deepEqual(payoutFor({ helpers: [], solo: false }).shares, []);
});

test("solo is worth more than any single share, and that is the whole bargain", () => {
  const alone = payoutFor({ helpers: ["mira"], solo: true, soloCharacterId: "mira" });
  const shared = payoutFor({ helpers: ["mira", "rowan"], solo: false });

  const hers = alone.shares[0].xp;
  const best = Math.max(...shared.shares.map((share) => share.xp));
  assert.ok(hers > best, `${hers} must beat ${best} or nobody would ever risk it`);

  // And the other side of the bargain: no bond. Bonds are what Family Moves are
  // made of, so the independent child levels faster and ends up with a thinner
  // sheet. Both children are right about themselves.
  assert.equal(alone.bondPairs.length, 0);
  assert.ok(shared.bondPairs.length > 0);
});

test("an encounter sits between an errand and something that was hers", () => {
  assert.ok(ENCOUNTER_XP > QUEST_XP.SIDE);
  assert.ok(ENCOUNTER_XP < QUEST_XP.PERSONAL);
});

// ---- What the storyteller is told -------------------------------------------

const view = {
  name: "The Angry Customer",
  want: "to be taken seriously",
  kind: "PERSON" as const,
  works: ["admitting it", "asking what actually happened"],
  backfires: ["a clever lie"],
  wayOut: "leave and accept that he tells the baker",
  ground: 0,
  soloName: null,
};

test("it is told what the thing wants, not what it is", () => {
  const told = encounterGuidance(view);

  assert.match(told, /THE ANGRY CUSTOMER/);
  assert.match(told, /What it wants: to be taken seriously/);
  assert.match(told, /admitting it/);
  assert.match(told, /a clever lie/);
});

test("the way out is always in front of them", () => {
  // A child who has had enough must always be able to go. Asserted here rather
  // than trusted, because it is the one line that keeps a frightening encounter
  // from becoming a trap.
  assert.match(encounterGuidance(view), /The way out, if they take it/);
});

test("it is forbidden from settling the thing itself", () => {
  const told = encounterGuidance(view);
  assert.match(told, /Do NOT resolve it for them/);
  assert.match(told, /does not simply/);
});

test("nothing here is fought", () => {
  const told = encounterGuidance(view);
  assert.match(told, /Nobody is hurt and nothing is fought/i);
});

test("how it is going is said in words, not in numbers", () => {
  assert.match(encounterGuidance({ ...view, ground: 2 }), /2 ahead/);
  assert.match(encounterGuidance({ ...view, ground: -2 }), /2 against them/);
  assert.match(encounterGuidance(view), /Neither side has the upper hand/);
});

test("a girl who said she has it is named", () => {
  assert.match(encounterGuidance({ ...view, soloName: "Mira" }), /Mira has said she is handling/);
});

test("both endings are said out loud, and neither is a defeat", () => {
  assert.match(endingNote("The Angry Customer", "THROUGH"), /got through it/);

  const turned = endingNote("The Angry Customer", "TURNED");
  assert.match(turned, /the story goes on/);
  assert.doesNotMatch(turned, /lost|lose|fail/i);
});

test("an encounter's ending survives into the recap, both ways", () => {
  // Checked here rather than assumed. `endingNote` is pushed onto the same
  // milestone list as everything else a turn writes, and `recapFor` filters
  // that list on the *shape of the sentence* — anything phrased like a spend
  // ("Mira used Step In.") is dropped as not worth remembering a week later.
  //
  // An encounter ending is the biggest thing that happens in a chapter and is
  // one rewording away from looking like a spend, so the guard is the wording
  // itself: change it to "the Hollow Man used its last trick." and this fails
  // rather than the chapter cards quietly losing their best line.
  assert.equal(worthKeeping(endingNote("The Hollow Man", "THROUGH")), true);
  assert.equal(worthKeeping(endingNote("The Hollow Man", "TURNED")), true);

  // And the thing it is being told apart from still goes.
  assert.equal(worthKeeping("Mira used Step In."), false);
});
