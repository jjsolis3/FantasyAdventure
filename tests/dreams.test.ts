import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_COOLDOWN_TURNS,
  ECHO_LIMIT_PER_TURN,
  dreamNote,
  echoSummary,
  mayEcho,
} from "../lib/game/dreams.ts";
import { extractionSchema } from "../lib/ai/schemas.ts";

test("a wish nobody has answered yet is always allowed to be heard", () => {
  // A child who writes an ambition and hears nothing for a month has learned
  // the box was decorative. The first whisper must be able to arrive early.
  assert.equal(mayEcho(null, 0), true);
  assert.equal(mayEcho(null, 40), true);
});

test("and then the world has to wait", () => {
  // The half that is not left to the model. "Mention this occasionally" handed
  // to a small local model becomes "mention this constantly", because every
  // turn looks like a fresh chance to be helpful — and a wish mentioned every
  // turn is a running joke rather than a long ambition.
  assert.equal(mayEcho(10, 10), false, "not twice in one turn");
  assert.equal(mayEcho(10, 10 + ECHO_COOLDOWN_TURNS - 1), false, "nor a turn early");
  assert.equal(mayEcho(10, 10 + ECHO_COOLDOWN_TURNS), true, "and then it may");
});

test("the cooldown is per wish, not per table", () => {
  // Two sisters with two dreams should each get their own. Sharing one clock
  // would mean the louder player's wish quietly starved the other's.
  const mira = 10;
  const rowan = null;
  assert.equal(mayEcho(mira, 12), false);
  assert.equal(mayEcho(rowan, 12), true);
});

test("only the wishes it may touch are ever named", () => {
  const note = dreamNote([
    { characterName: "Mira", wish: "I want to find out who left me on the step.", lastEchoTurn: null },
  ]);

  assert.match(note, /Mira: I want to find out who left me on the step\./);
  assert.match(note, /brush against ONE of these, at most/);

  // The instruction that carries the whole feature.
  assert.match(note, /never answer one/i);
  assert.match(note, /when the family says they end/i);

  // Nothing at all when there is nothing to say — not a heading with an empty
  // list under it, which a small model reads as a space to fill.
  assert.equal(dreamNote([]), "");
});

test("the storyteller has no way to say a wish came true", () => {
  // The load-bearing absence. A model that ends a year-long ambition because
  // the scene was going well has spent the thing that made next Saturday
  // matter, and nobody can give it back. There is no field for it, so it
  // cannot be reported however the passage went.
  const shape = extractionSchema.parse({
    dreamEchoes: [{ character: "Mira", note: "A pedlar remembered a basket left at a door." }],
  });

  assert.deepEqual(shape.dreamEchoes, [
    { character: "Mira", note: "A pedlar remembered a basket left at a door." },
  ]);
  assert.equal("dreamAnswered" in shape, false);
  assert.equal("dreamComplete" in shape, false);

  // And anything it invents beyond the cap is dropped before it reaches the
  // engine at all.
  const flood = extractionSchema.safeParse({
    dreamEchoes: Array.from({ length: 5 }, () => ({ character: "Mira", note: "again" })),
  });
  assert.equal(flood.success, false, "more than two in one passage is refused outright");
});

test("a turn with no wishes in it is the ordinary case", () => {
  // Every extraction written before dreams existed still parses, and reports
  // no echoes rather than failing — which is what keeps this from changing a
  // single adventure already under way.
  const old = extractionSchema.parse({ memories: [], bondMoments: [] });
  assert.deepEqual(old.dreamEchoes, []);
});

test("the sheet counts what the world has said", () => {
  assert.equal(echoSummary(0), "The world has not said anything about this yet.");
  assert.match(echoSummary(1), /^Once,/);
  assert.match(echoSummary(4), /^4 times now,/);
});

test("a passage may not spend more than two whispers", () => {
  // A passage that brushed against three wishes touched none of them, and
  // recording all three would teach a family in one evening that these are
  // cheap.
  assert.equal(ECHO_LIMIT_PER_TURN, 2);
  assert.ok(ECHO_LIMIT_PER_TURN < ECHO_COOLDOWN_TURNS);
});
