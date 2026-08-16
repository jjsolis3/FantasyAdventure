import test from "node:test";
import assert from "node:assert/strict";
import { whatWouldCount, looksLikeTheSameThing } from "../lib/game/finds.ts";
import { alreadyTried, leadsFrom } from "../lib/game/briefing.ts";
import { ledgerLine } from "../lib/game/recap.ts";
import { summaryPrompt, extractionPrompt } from "../lib/ai/prompts.ts";

/**
 * Telling a table what it is actually doing.
 *
 * Everything here answers one sentence from a family who had just played a
 * whole evening: *"still somewhat confusing as to what is needed to accomplish
 * said quests"*. None of it is a hint — every piece is a fact the game already
 * held and had never said out loud.
 */

// ---- What would count -------------------------------------------------------

test("counts: the words shown are the words the matcher looks for", () => {
  const sought = "the collector's sky-map, creased and still warm";
  const counts = whatWouldCount(sought);

  assert.ok(counts.includes("sky-map"), counts.join(", "));
  // And the promise the screen makes is true: something named out of those
  // words really is accepted.
  assert.equal(looksLikeTheSameThing(sought, "a warm sky-map"), true);
});

test("counts: filler words are not offered as things to hunt for", () => {
  const counts = whatWouldCount("a small old brass key");
  assert.deepEqual(counts, ["brass", "key"]);
});

test("counts: the same word is not asked for twice", () => {
  assert.deepEqual(whatWouldCount("the key, the brass key"), ["key", "brass"]);
});

test("counts: order follows how it was written", () => {
  // "sky-map" before "creased", because that is the phrase she read.
  assert.deepEqual(whatWouldCount("the sky-map, creased"), ["sky-map", "creased"]);
});

// ---- Leads ------------------------------------------------------------------

const passage = (leads?: string[]) => ({ metadata: leads ? { leads } : null });

test("leads: gathered across the scene, not read off the newest passage", () => {
  // The difference between a lead and a thing on the table. A door mentioned
  // three turns ago is still shut and still worth walking through.
  const turns = [passage(["the bell-ringer keeps the old charts"]), passage(), passage()];
  assert.deepEqual(leadsFrom(turns), ["the bell-ringer keeps the old charts"]);
});

test("leads: newest first", () => {
  const turns = [passage(["the old mill"]), passage(["the bell tower"])];
  assert.deepEqual(leadsFrom(turns), ["the bell tower", "the old mill"]);
});

test("leads: a repeated lead appears once", () => {
  // The storyteller is told to repeat a live lead, so the same door arrives
  // several turns running.
  const turns = [passage(["the bell tower"]), passage(["The Bell Tower"])];
  assert.deepEqual(leadsFrom(turns), ["The Bell Tower"]);
});

test("leads: capped, because a signpost at every crossroads is no signpost", () => {
  const turns = [passage(["a"]), passage(["b"]), passage(["c"]), passage(["d"])];
  assert.equal(leadsFrom(turns).length, 3);
});

test("leads: a scene with none is empty rather than invented", () => {
  assert.deepEqual(leadsFrom([passage(), passage()]), []);
});

// ---- What they have already tried -------------------------------------------

const tried = (content: string) => ({ type: "PLAYER_ACTION", content, metadata: null });
const said = (content: string) => ({
  type: "PLAYER_ACTION",
  content,
  metadata: { spoken: true },
});
const told = (content: string) => ({ type: "NARRATION", content, metadata: null });

test("tried: attempts come back newest first", () => {
  const turns = [tried("I look under the loose board"), told("…"), tried("I check the barn")];
  assert.deepEqual(alreadyTried(turns), ["I check the barn", "I look under the loose board"]);
});

test("tried: the same thing typed twice is one line", () => {
  const turns = [tried("I check the barn"), tried("I check the barn!")];
  assert.deepEqual(alreadyTried(turns), ["I check the barn!"]);
});

test("tried: the words somebody actually typed are what is shown", () => {
  // Normalised only for the comparison. The list is theirs, punctuation and all.
  assert.deepEqual(alreadyTried([tried("I check the barn — again")]), [
    "I check the barn — again",
  ]);
});

test("tried: talking is not an attempt", () => {
  const turns = [said("Rowan, what did you see?"), tried("I open the cupboard")];
  assert.deepEqual(alreadyTried(turns), ["I open the cupboard"]);
});

test("tried: passages are not attempts", () => {
  assert.deepEqual(alreadyTried([told("The barley shifts.")]), []);
});

// ---- The recap --------------------------------------------------------------

test("recap: the ledger is handed to the summariser as facts, not prose", () => {
  const prompt = summaryPrompt({
    sceneTitle: "The Barley Field",
    transcript: "…",
    ledger: ledgerLine(["Mira is now carrying: the sky-map", "Mira and Rowan grew closer."]),
  });

  assert.match(prompt, /WHAT ACTUALLY CHANGED/);
  assert.match(prompt, /- Mira is now carrying: the sky-map/);
  // The instruction that stops it merely restating the list.
  assert.match(prompt, /Do not repeat\s+the list/);
});

test("recap: a scene where nothing changed asks the old question, unchanged", () => {
  const prompt = summaryPrompt({ sceneTitle: "The Lane", transcript: "…" });
  assert.doesNotMatch(prompt, /WHAT ACTUALLY CHANGED/);
});

test("recap: an empty ledger is an empty string, not an empty heading", () => {
  assert.equal(ledgerLine([]), "");
});

// ---- The storyteller's side of it -------------------------------------------

test("leads: the storyteller is told it is the next door, never what is behind it", () => {
  const prompt = extractionPrompt({ narration: "The barley shifts.", partyNames: ["Mira", "Rowan"] });

  assert.match(prompt, /"leads"/);
  assert.match(prompt, /THE NEXT DOOR, never what is behind it/);
  // And that most turns have none, which is what keeps it from becoming a
  // signpost at every crossroads.
  assert.match(prompt, /\[\] is the right answer on most turns/);
});
