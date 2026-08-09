import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PACING_OPTIONS,
  pacingGuidance,
  pacingOption,
  totalScenesFor,
} from "../lib/game/pacing.ts";

test("every pacing is distinct and ordered shortest to longest", () => {
  const lengths = PACING_OPTIONS.map((option) => option.scenesPerAct);
  assert.deepEqual(lengths, [...lengths].sort((a, b) => a - b));
  assert.equal(new Set(lengths).size, lengths.length, "two pacings that run the same length are one pacing");
});

test("an unknown pacing falls back to the middle rather than throwing", () => {
  // A row written before this column existed, or a hand-edited database, must
  // not be able to stop a turn.
  assert.equal(pacingOption("").key, "STANDARD");
  assert.equal(pacingOption("WHENEVER").key, "STANDARD");
});

test("total length scales with the act count", () => {
  assert.equal(totalScenesFor("BRISK", 3), 6);
  assert.equal(totalScenesFor("LEISURELY", 3), 21);
  // A storyline with no acts must not produce zero scenes' worth of guidance.
  assert.ok(totalScenesFor("STANDARD", 0) > 0);
});

test("early in an act, the storyteller is told there is room", () => {
  const guidance = pacingGuidance({ pacing: "STANDARD", sceneInAct: 1, actIndex: 0, actCount: 3 });
  assert.match(guidance, /room left/i);
  assert.match(guidance, /scene 1 of act 1 of 3/i);
});

test("at the expected length, it is told to start closing", () => {
  const guidance = pacingGuidance({ pacing: "BRISK", sceneInAct: 2, actIndex: 0, actCount: 3 });
  assert.match(guidance, /drawing this act toward its close/i);
});

test("well past the expected length, it is told to wrap up", () => {
  const guidance = pacingGuidance({ pacing: "BRISK", sceneInAct: 9, actIndex: 2, actCount: 3 });
  assert.match(guidance, /run well past/i);
  assert.match(guidance, /do not cut/i, "wrapping up must not mean cutting a moment short");
});

test("guidance never demands an ending outright", () => {
  // The failure this guards against: handed an instruction rather than a
  // nudge, a model ends an act mid-sentence to comply.
  for (const option of PACING_OPTIONS) {
    for (const sceneInAct of [1, 2, 4, 7, 12, 30]) {
      const guidance = pacingGuidance({
        pacing: option.key,
        sceneInAct,
        actIndex: 1,
        actCount: 3,
      });
      assert.doesNotMatch(guidance, /you must|end it now|immediately/i, `${option.key}@${sceneInAct}`);
      assert.match(guidance, /actComplete/, "guidance has to name the field it is about");
    }
  }
});

test("a brisk adventure is told to close sooner than a leisurely one", () => {
  const atFourScenes = { sceneInAct: 4, actIndex: 0, actCount: 3 };
  assert.match(pacingGuidance({ pacing: "BRISK", ...atFourScenes }), /run well past/i);
  assert.match(pacingGuidance({ pacing: "LEISURELY", ...atFourScenes }), /room left/i);
});
