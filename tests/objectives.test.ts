import test from "node:test";
import assert from "node:assert/strict";
import {
  STUCK_AFTER,
  objectiveRows,
  splitObjective,
  stuckNote,
  stuckObjectives,
} from "../lib/game/quests.ts";
import { extractionPrompt, narrationPrompt, personalQuestsPrompt } from "../lib/ai/prompts.ts";

/**
 * The evening that made all of this necessary.
 *
 * Sixteen turns, one chapter, and two separate reasons for it: an objective
 * that could not be ticked by any sequence of events, and a personal aim with
 * two conditions in one line so half of it could be finished invisibly.
 */

// ---- One line, one thing ----------------------------------------------------

test("split: the aim that started this becomes two", () => {
  assert.deepEqual(
    splitObjective("Craft the oversized wooden coffee mug and successfully take the first morning sip from it."),
    ["Craft the oversized wooden coffee mug", "take the first morning sip from it"],
  );
});

test("split: a bare 'and' followed by an instruction splits", () => {
  assert.deepEqual(splitObjective("Find the brass key and open the cellar door"), [
    "Find the brass key",
    "open the cellar door",
  ]);
});

test("split: a needle and thread stays one thing", () => {
  // The failure mode that would be worse than the bug: inventing an objective
  // nobody can finish is exactly what this whole round is fixing.
  assert.deepEqual(splitObjective("a needle and thread"), ["a needle and thread"]);
  assert.deepEqual(splitObjective("the bell-rope, long enough for two pairs of hands"), [
    "the bell-rope, long enough for two pairs of hands",
  ]);
  assert.deepEqual(splitObjective("bread and butter pudding"), ["bread and butter pudding"]);
});

test("split: a companion is left exactly as written", () => {
  // The one that could not be ticked. It must survive untouched — splitting it
  // would turn one impossible objective into two.
  assert.deepEqual(splitObjective("the first thing you made, awake now and following you about"), [
    "the first thing you made, awake now and following you about",
  ]);
});

test("split: 'and then' always splits, whatever follows", () => {
  assert.deepEqual(splitObjective("Ring the bell and then wait by the gate"), [
    "Ring the bell",
    "wait by the gate",
  ]);
});

test("split: three-part instructions come apart into three", () => {
  assert.deepEqual(
    splitObjective("Bake the loaf and then carry it to the mill and finally leave it on the step"),
    ["Bake the loaf", "carry it to the mill", "leave it on the step"],
  );
});

test("split: a trailing full stop is not part of the objective", () => {
  assert.deepEqual(splitObjective("Feed the goat."), ["Feed the goat"]);
});

test("rows: numbered in order, deduplicated, and capped", () => {
  const rows = objectiveRows([
    { kind: "DEED", text: "Craft the mug and take the first sip" },
    { kind: "FIND", text: "the brass key" },
    // A model repeating itself does not get two identical lines.
    { kind: "FIND", text: "The Brass Key" },
  ]);

  assert.deepEqual(
    rows.map((row) => row.text),
    ["Craft the mug", "take the first sip", "the brass key"],
  );
  assert.deepEqual(
    rows.map((row) => row.position),
    [0, 1, 2],
  );
  assert.equal(rows[0].kind, "DEED");
  assert.equal(rows[2].kind, "FIND");
});

test("rows: one enormous sentence does not become a checklist of nine", () => {
  const rows = objectiveRows(
    [{ kind: "DEED", text: "Get the rope and then climb the wall and then open the hatch and then ring the bell and then find the cat and then go home" }],
    3,
  );
  assert.equal(rows.length, 3);
});

// ---- Stuck ------------------------------------------------------------------

const quest = (openedAtTurn: number, done: (number | null)[]) => ({
  openedAtTurn,
  objectives: done.map((doneAtTurn, index) => ({ text: `thing ${index}`, doneAtTurn })),
});

test("stuck: a party working steadily is never told they are stuck", () => {
  assert.deepEqual(stuckObjectives([quest(1, [null])], 1 + STUCK_AFTER - 1), []);
});

test("stuck: sixteen turns on one untouched chapter is noticed", () => {
  const stuck = stuckObjectives([quest(1, [null])], 17);
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].turns, 16);
});

test("stuck: one of three ticked off means they are getting somewhere", () => {
  // Telling a party who have found one of three that they are stuck would be
  // both wrong and discouraging.
  assert.deepEqual(stuckObjectives([quest(1, [4, null, null])], 20), []);
});

test("stuck: every outstanding line on a stalled quest is named", () => {
  const stuck = stuckObjectives([quest(1, [null, null])], 20);
  assert.equal(stuck.length, 2);
});

test("stuck: the storyteller is told to put it back in reach, not to hand it over", () => {
  const note = stuckNote([{ text: "the first thing you made", turns: 16 }]);

  assert.match(note, /STILL WAITING, 16 TURNS LATER/);
  assert.match(note, /- the first thing you made/);
  assert.match(note, /Put it back within reach/);
  // The load-bearing half. A model told only "they are stuck" solves the
  // chapter for them, which is the one way to spoil this game.
  assert.match(note, /Do NOT hand it over/);
  assert.match(note, /picking it up is still a turn/);
});

test("stuck: nothing stuck says nothing at all", () => {
  assert.equal(stuckNote([]), "");
});

test("stuck: it reaches the passage that could fix it", () => {
  const prompt = narrationPrompt({
    context: "…",
    actions: [{ character: "Orin", text: "I look around" }],
    resolutions: "…",
    stuck: stuckNote([{ text: "the first thing you made", turns: 16 }]),
  });
  assert.match(prompt, /STILL WAITING, 16 TURNS LATER/);
});

// ---- The objective that could not be ticked ---------------------------------

test("objectives: the storyteller is asked about everything outstanding, not only deeds", () => {
  const prompt = extractionPrompt({
    narration: "The owl hops onto Ember's shoulder.",
    partyNames: ["Orin", "Ember"],
    openDeeds: ["the first thing you made, awake now and following you about"],
  });

  assert.match(prompt, /WHAT THE PARTY IS STILL TRYING TO DO OR GET HOLD OF/);
  assert.match(prompt, /- the first thing you made/);
  // And it is told which ones it is for: the things that are true in a story
  // and could never be true in a pocket.
  assert.match(prompt, /could never be true in a pocket/);
  assert.match(prompt, /a creature, a companion/);
});

test("objectives: 'close' is not 'finished'", () => {
  const prompt = extractionPrompt({ narration: "…", partyNames: ["Orin"], openDeeds: ["a thing"] });
  assert.match(prompt, /Being close, being told where it is, or wanting\s+it very much is not finished/);
});

test("objectives: both places one is written ask for one thing", () => {
  const extraction = extractionPrompt({ narration: "…", partyNames: ["Orin"] });
  assert.match(extraction, /ONE THING PER OBJECTIVE/);

  const aims = personalQuestsPrompt({
    context: "…",
    actTitle: "What You Make, Wakes",
    party: [{ name: "Orin", archetype: "Wondersmith", description: null }],
  });
  assert.match(aims, /ONE thing, not two/);
  assert.match(aims, /Craft the mug and take the first sip/);
});
