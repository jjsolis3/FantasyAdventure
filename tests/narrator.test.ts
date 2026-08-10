import { strict as assert } from "node:assert";
import { test } from "node:test";
import { intoSpeakableChunks } from "../components/play/use-narrator.ts";

test("narrator: a passage is read one sentence at a time", () => {
  const chunks = intoSpeakableChunks("The gate creaks. Mira steps back. Nothing moves.");
  assert.deepEqual(chunks, ["The gate creaks.", "Mira steps back.", "Nothing moves."]);
});

test("narrator: paragraph breaks do not become pauses in the middle of words", () => {
  const chunks = intoSpeakableChunks("She hums.\n\nThe dragon hums back.");
  assert.deepEqual(chunks, ["She hums.", "The dragon hums back."]);
});

test("narrator: a sentence longer than a chunk is broken where it can be", () => {
  const long = `${"a".repeat(120)}, ${"b".repeat(120)}, and then it stops.`;
  const chunks = intoSpeakableChunks(long, 130);

  assert.ok(chunks.length > 1, "should have been split");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 130, `chunk of ${chunk.length} exceeds the limit`);
  }
  // Nothing may be dropped: the story is what is being read.
  assert.equal(chunks.join(" ").replace(/\s+/g, ""), long.replace(/\s+/g, ""));
});

test("narrator: an exclamation is a sentence too", () => {
  assert.deepEqual(intoSpeakableChunks("Look out! It is only a goat."), [
    "Look out!",
    "It is only a goat.",
  ]);
});

test("narrator: nothing to say produces nothing to speak", () => {
  assert.deepEqual(intoSpeakableChunks("   "), []);
});
