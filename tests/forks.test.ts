import test from "node:test";
import assert from "node:assert/strict";
import { chosenRoadNote, isForkChoice, optionsUsable } from "../lib/game/forks.ts";
import { extractionSchema } from "../lib/ai/schemas.ts";

const mill = { where: "the drowned mill", why: "the wheel is still turning with nobody there" };
const cottage = { where: "the bell-ringer's cottage", why: "she kept the old charts" };

test("two different roads are worth offering", () => {
  assert.equal(optionsUsable(mill, cottage), true);
});

test("the same road twice is not", () => {
  // The failure a small local model actually produces, because it is being
  // asked for variety at the exact moment it has least to go on. A fork like
  // this is worse than none: it asks a child to choose and then makes the
  // choice meaningless, which teaches her the choosing was theatre.
  assert.equal(optionsUsable(mill, { where: "the drowned mill", why: "somebody is up there" }), false);
  assert.equal(
    optionsUsable(mill, { where: "  The Drowned Mill  ", why: "different words, same place" }),
    false,
    "and case and padding do not make it a different place",
  );
});

test("an option missing its half is not offered either", () => {
  assert.equal(optionsUsable({ where: "", why: "somewhere" }, cottage), false);
  assert.equal(optionsUsable({ where: "the mill", why: "  " }, cottage), false);
});

test("only A or B may be chosen", () => {
  assert.equal(isForkChoice("A"), true);
  assert.equal(isForkChoice("B"), true);
  for (const bad of ["C", "a", "", null, undefined, 0, "A "]) {
    assert.equal(isForkChoice(bad), false, String(bad));
  }
});

test("the road taken is written for the storyteller, not for a database", () => {
  // This becomes a memory, and memories are read straight into the next
  // chapter's context. It has to read as a sentence about the party.
  const note = chosenRoadNote(mill);
  assert.match(note, /^The party chose to go to the drowned mill —/);
  assert.match(note, /the wheel is still turning/);
});

test("exactly two ways on, or none at all", () => {
  // One way on is a corridor and three is a menu, and both are worse than the
  // single choice this exists to offer.
  const two = extractionSchema.parse({ waysOn: [mill, cottage] });
  assert.equal(two.waysOn.length, 2);

  const none = extractionSchema.parse({});
  assert.deepEqual(none.waysOn, [], "and a turn that ends nothing offers nothing");

  const three = extractionSchema.safeParse({ waysOn: [mill, cottage, mill] });
  assert.equal(three.success, false, "three is refused outright");
});

test("a single way on parses but is refused before anybody sees it", () => {
  // The schema allows one so that a model half-following the instruction does
  // not fail the whole extraction and cost the party their turn. The engine
  // requires two, so nothing reaches a child.
  const one = extractionSchema.parse({ waysOn: [mill] });
  assert.equal(one.waysOn.length, 1, "the extraction survives");
  assert.notEqual(one.waysOn.length, 2, "and the engine's gate, which is exactly two, refuses it");
});
