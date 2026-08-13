import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRESSURE_NAME,
  advance,
  movedForward,
  pressureAt,
  pressureGuidance,
  pressureLimit,
  shouldTick,
  type TurnShape,
} from "../lib/game/pressure.ts";
import { PACING_OPTIONS } from "../lib/game/pacing.ts";
import { narrationPrompt, systemPrompt } from "../lib/ai/prompts.ts";

/** A turn where the party did nothing of any consequence. */
const nothing: TurnShape = {
  outcomes: [],
  deedsDone: 0,
  itemsGained: 0,
  questsOpened: 0,
  sceneComplete: false,
  actComplete: false,
  storytellerSaysMoved: false,
};

// ---- What counts as getting somewhere --------------------------------------

test("a check that landed is progress, whatever the storyteller thinks", () => {
  // Hard signals outrank the model's opinion, in both directions. She climbed
  // the thing; no amount of modest narration makes that a wasted turn.
  for (const outcome of ["SUCCESS", "CRITICAL"]) {
    assert.equal(movedForward({ ...nothing, outcomes: [outcome] }), true, outcome);
  }
});

test("finishing, finding, or being given something to do is progress", () => {
  assert.equal(movedForward({ ...nothing, deedsDone: 1 }), true);
  assert.equal(movedForward({ ...nothing, itemsGained: 1 }), true);
  assert.equal(movedForward({ ...nothing, questsOpened: 1 }), true);
  assert.equal(movedForward({ ...nothing, sceneComplete: true }), true);
  assert.equal(movedForward({ ...nothing, actComplete: true }), true);
});

test("asking somebody a question and getting an answer is progress", () => {
  // The most valuable kind of turn there is, and the one the hard signals
  // cannot see: no objective finishes and nothing lands in a pocket when a girl
  // works out who else was at the fair. This is the whole reason the
  // storyteller gets a say at all.
  assert.equal(movedForward({ ...nothing, storytellerSaysMoved: true }), true);
});

test("a turn that was genuinely nothing is nothing", () => {
  assert.equal(movedForward(nothing), false);
});

// ---- What moves the clock ---------------------------------------------------

test("dithering moves it", () => {
  assert.equal(shouldTick(nothing), true);
});

test("trying and failing does not", () => {
  // The line the whole design rests on. She committed to something the game
  // thought could fail, and the dice were unkind — the complication is already
  // her cost, and charging her twice for one bad roll is how a game teaches a
  // child not to try.
  for (const outcome of ["PARTIAL", "COMPLICATION"]) {
    assert.equal(
      shouldTick({ ...nothing, outcomes: [outcome] }),
      false,
      `${outcome} must not be charged twice`,
    );
  }
});

test("one real attempt covers a whole turn of nonsense beside it", () => {
  // Two sisters answer; one messes about, one tries the door. The turn is not
  // a wasted one, and picking apart who deserves what would turn a shared game
  // into a scoreboard.
  assert.equal(shouldTick({ ...nothing, outcomes: ["COMPLICATION"] }), false);
});

test("the two signals must agree before anything moves", () => {
  // Erring toward not ticking is deliberate: an unfair tick is felt at once by
  // a nine-year-old, and a missed one is invisible.
  assert.equal(shouldTick({ ...nothing, storytellerSaysMoved: true }), false);
  assert.equal(shouldTick({ ...nothing, deedsDone: 1 }), false);
});

// ---- The clock itself -------------------------------------------------------

test("the limit follows how long this family likes an act", () => {
  for (const option of PACING_OPTIONS) {
    const limit = pressureLimit(option.key);
    assert.equal(limit, option.scenesPerAct + 2);
    // A fixed number would mean something different in each: a clock of six
    // fills twice over in a brisk act and never fills at all in a leisurely one.
    assert.ok(limit > option.scenesPerAct, option.key);
  }
});

test("an unknown pacing still gives a workable clock", () => {
  assert.ok(pressureLimit("NONSENSE") > 0);
});

test("it climbs one notch at a time and stops at the top", () => {
  const limit = pressureLimit("STANDARD");
  let level = 0;
  for (let turn = 0; turn < limit + 5; turn += 1) {
    level = advance(pressureAt(level, limit), true);
    if (level === 0) break;
  }
  assert.equal(pressureAt(limit, limit).level, limit, "never past the top");
});

test("a full clock is a debt, and the next turn pays it", () => {
  const limit = 4;

  // Four wasted turns to fill it.
  let level = 0;
  for (let turn = 0; turn < limit; turn += 1) level = advance(pressureAt(level, limit), true);
  assert.equal(level, limit);

  // The turn that filled it could not have shown the consequence — that passage
  // was written before the game had read it. So the next one collects.
  const owed = pressureAt(level, limit);
  assert.equal(owed.owed, true);
  assert.match(pressureGuidance({ name: "The fog", ...owed }), /IT HAS RUN OUT/);

  // And having collected, it resets: one filling buys exactly one consequence.
  assert.equal(advance(owed, true), 0);
  assert.equal(advance(owed, false), 0);
});

test("a party getting on with it never sees a clock at all", () => {
  const state = pressureAt(0, pressureLimit("STANDARD"));
  assert.equal(pressureGuidance({ name: "The fog", ...state }), "");
});

// ---- What the storyteller is told -------------------------------------------

test("a moving clock is described, never explained", () => {
  const told = pressureGuidance({ name: "The fog", level: 2, limit: 8, owed: false });

  assert.match(told, /THE FOG — 2 of 8/);
  assert.match(told, /one concrete detail, not a warning/i);
});

test("it is forbidden from solving the problem, at every level", () => {
  // The failure this whole feature exists to prevent: a stuck party being
  // handed the answer, which children work out in about two evenings, after
  // which there is no reason left to think about anything.
  for (const level of [1, 4, 7]) {
    const told = pressureGuidance({ name: "The fog", level, limit: 8, owed: false });
    assert.match(told, /Do NOT solve their problem/);
    assert.match(told, /Never the answer itself/);
    // It must still offer them a way through, or being stuck becomes a wall.
    assert.match(told, /new way to look/);
  }
});

test("the last notch reads differently from the middle ones", () => {
  const middle = pressureGuidance({ name: "The fog", level: 4, limit: 8, owed: false });
  const last = pressureGuidance({ name: "The fog", level: 7, limit: 8, owed: false });

  assert.doesNotMatch(middle, /nearly out of room/);
  assert.match(last, /nearly out of room/);
});

test("running out is never the end of the adventure", () => {
  const told = pressureGuidance({ name: "The fog", level: 8, limit: 8, owed: true });

  assert.match(told, /the adventure is not over/i);
  assert.match(told, /nobody is hurt/i);
  // And it must not turn into a telling-off. The story does the teaching.
  assert.match(told, /do not scold anybody/i);
});

test("there is a name to fall back on", () => {
  assert.ok(DEFAULT_PRESSURE_NAME.length > 0);
});

// ---- The wiring -------------------------------------------------------------

test("the block reaches the passage the storyteller is writing", () => {
  // The gap this closes: every part of this feature can be correct and the
  // clock still do nothing at the table, because the one string that matters
  // never made it into the prompt. Asserted here rather than end-to-end because
  // prompts are not logged — there is nowhere afterwards to look.
  const told = pressureGuidance({ name: "The fog", level: 3, limit: 6, owed: false });

  const withClock = narrationPrompt({
    context: "CONTEXT",
    actions: [{ character: "Mira", text: "I wander about." }],
    resolutions: "Nothing needed a dice roll this turn.",
    pressure: told,
  });
  assert.ok(withClock.includes(told), "the guidance is missing from the narration prompt");

  // And a party getting on with it is told nothing at all — no empty heading,
  // no "0 of 6", nothing for a model to start writing weather about.
  const without = narrationPrompt({
    context: "CONTEXT",
    actions: [{ character: "Mira", text: "I open the gate." }],
    resolutions: "Nothing needed a dice roll this turn.",
    pressure: "",
  });
  assert.doesNotMatch(without, /THE FOG/i);
});

test("the storyteller is forbidden from solving it, on every single turn", () => {
  // Not only when the clock is running. The giveaway is the failure mode this
  // whole feature exists to prevent, so the rule lives in the contract that is
  // sent with every call rather than in a block that only sometimes appears.
  const contract = systemPrompt({ tone: "ADVENTUROUS", readingLevel: "MIDDLE_GRADE" });

  assert.match(contract, /NEVER hand the players the answer/i);
  assert.match(contract, /new way to look/i);
});
