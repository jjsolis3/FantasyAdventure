import assert from "node:assert/strict";
import test from "node:test";
import { tableFrom } from "../lib/game/briefing.ts";
import { extractionPrompt, nudgePrompt, suggestionPrompt } from "../lib/ai/prompts.ts";
import { extractionSchema, nudgeSchema } from "../lib/ai/schemas.ts";

// ---- Reading the question back off the passage ------------------------------

test("the question comes from the last passage that asked one", () => {
  // A round spent talking writes a passage of its own and moves nothing on, so
  // the question from before the conversation is still the live one.
  const turns = [
    { metadata: { whatNow: "The shutter is nailed shut. Do you try the roof?" } },
    { metadata: null },
    { metadata: { spoken: true } },
  ];

  assert.equal(tableFrom(turns).whatNow, "The shutter is nailed shut. Do you try the roof?");
});

test("the things in front of them come back too, and from the newest passage that had any", () => {
  const turns = [
    { metadata: { onTheTable: ["the cellar door", "Bram's empty chair"] } },
    { metadata: { whatNow: "Well?", onTheTable: ["a light on the far bank"] } },
  ];

  const table = tableFrom(turns);
  assert.equal(table.whatNow, "Well?");
  assert.deepEqual(table.onTheTable, ["a light on the far bank"]);
});

test("a scene that has said nothing yet reports nothing rather than throwing", () => {
  assert.deepEqual(tableFrom([]), { whatNow: null, onTheTable: [] });
  assert.deepEqual(tableFrom([{ metadata: null }]), { whatNow: null, onTheTable: [] });
});

test("blank entries are dropped rather than shown as empty chips", () => {
  const table = tableFrom([{ metadata: { onTheTable: ["the well", "  ", ""] } }]);
  assert.deepEqual(table.onTheTable, ["the well"]);
});

// ---- What the storyteller is asked for --------------------------------------

test("extraction asks for the things a passage put within reach", () => {
  const prompt = extractionPrompt({
    narration: "The shutter is nailed shut.",
    partyNames: ["Mira", "Rowan"],
  });

  assert.match(prompt, /"onTheTable"/);
  // The rule that keeps them nouns rather than advice is the whole point.
  assert.match(prompt, /NOT hints and NOT instructions/);
  assert.match(prompt, /Do not include the answer to a puzzle/);
});

test("the opening passage is asked the same thing", () => {
  const prompt = nudgePrompt({ narration: "Rain on the barn roof.", partyNames: ["Mira"] });
  assert.match(prompt, /onTheTable/);
  assert.match(prompt, /never verbs aimed at the players/i);
});

test("the schema keeps the list short enough to read across a room", () => {
  const parsed = extractionSchema.parse({
    onTheTable: ["one", "two", "three"],
  });
  assert.equal(parsed.onTheTable.length, 3);

  assert.throws(() => extractionSchema.parse({ onTheTable: ["a", "b", "c", "d"] }));
});

test("a storyteller that says nothing about it costs the table nothing", () => {
  assert.deepEqual(extractionSchema.parse({}).onTheTable, []);
  assert.deepEqual(nudgeSchema.parse({ whatNow: "Well?" }).onTheTable, []);
});

// ---- Nudges, not scripts -----------------------------------------------------

test("the stuck-player prompt asks for things noticed, not actions to take", () => {
  const prompt = suggestionPrompt({
    sceneText: "The mill is dark.",
    characterName: "Mira",
    characterSummary: "a shepherd who talks to goats",
    others: ["Rowan"],
  });

  // The old prompt asked for first-person actions and the button became the
  // fastest route through the game. These two lines are the fix.
  assert.match(prompt, /POINTS AT SOMETHING AND STOPS/);
  assert.match(prompt, /Never write in the first person/);
  assert.doesNotMatch(prompt, /in the first person, in\s+under fifteen words/);
  // And it still knows who else is at the table, so one nudge can point at her.
  assert.match(prompt, /Rowan/);
});

test("a nudge must not give away how the problem is solved", () => {
  const prompt = suggestionPrompt({
    sceneText: "The mill is dark.",
    characterName: "Mira",
    characterSummary: "a shepherd",
  });
  assert.match(prompt, /Never give away how the problem is solved/);
});

// ---- The guard behind the prompt ---------------------------------------------

test("advice that slipped past the prompt is trimmed or dropped", async () => {
  const { cleanTable } = await import("../lib/engine/play.ts");

  // The opener is trimmed off; what is left is a thing, so it stays.
  assert.deepEqual(cleanTable(["You could try the shutter"]), ["the shutter"]);
  assert.deepEqual(cleanTable(["Maybe the well"]), ["the well"]);

  // Still telling her what to do after the trim: dropped outright.
  assert.deepEqual(cleanTable(["Bram, who you should ask about the mill"]), []);

  // Housekeeping: blanks, trailing stops, duplicates, and the cap of three.
  assert.deepEqual(cleanTable(["the well.", "  ", "The Well"]), ["the well"]);
  assert.deepEqual(cleanTable(["a", "b", "c", "d"]), ["a", "b", "c"]);
});
