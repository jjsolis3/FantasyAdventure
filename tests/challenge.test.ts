import test from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGE_OPTIONS,
  nearMissFor,
  targetFor,
  type ChallengeKey,
} from "../lib/game/challenge.ts";
import { DIFFICULTIES, resolveCheck, resolveOutcome } from "../lib/engine/dice.ts";
import { statBlock } from "../lib/game/rules.ts";

const request = (challenge?: string) => ({
  characterId: "c1",
  characterName: "Mira",
  stat: "grace" as const,
  difficulty: "NORMAL" as const,
  challenge,
  intent: "slip past the sleeping dog",
});

test("the middle setting is exactly the game that shipped", () => {
  // The one claim that matters most on this whole feature. Every adventure
  // already under way defaults to BALANCED, so if this drifts, every table that
  // never asked for anything gets retuned underneath them.
  for (const band of ["EASY", "NORMAL", "HARD"] as const) {
    assert.equal(targetFor(band, "BALANCED"), DIFFICULTIES[band], band);
  }
  assert.equal(nearMissFor("BALANCED"), 2);
});

test("an unset or unrecognised setting falls back to the middle, never to a harder one", () => {
  // A column read before the migration, a hand-posted form, a typo in a seed.
  // Falling toward "tough" would quietly punish a table for somebody else's
  // mistake, so every unknown lands in the middle.
  for (const value of [undefined, "", "BANANAS", "gentle", "HARDEST"]) {
    assert.equal(targetFor("NORMAL", value), DIFFICULTIES.NORMAL, String(value));
    assert.equal(nearMissFor(value), 2, String(value));
  }
});

test("gentle lowers the bar and tough raises it, by the same step", () => {
  for (const band of ["EASY", "NORMAL", "HARD"] as const) {
    assert.equal(targetFor(band, "GENTLE"), DIFFICULTIES[band] - 2, band);
    assert.equal(targetFor(band, "TOUGH"), DIFFICULTIES[band] + 2, band);
  }
});

test("the near-miss window widens as it gets gentler", () => {
  assert.equal(nearMissFor("GENTLE"), 4);
  assert.equal(nearMissFor("TOUGH"), 1);

  // Which is the half that actually matters for a nine-year-old: the same roll,
  // three points under, is "it works, but…" on gentle and a complication on
  // tough. The tension survives either way; only the cost of missing moves.
  const target = DIFFICULTIES.NORMAL;
  assert.equal(resolveOutcome(10, target - 3, target, nearMissFor("GENTLE")), "PARTIAL");
  assert.equal(resolveOutcome(10, target - 3, target, nearMissFor("BALANCED")), "COMPLICATION");
  assert.equal(resolveOutcome(10, target - 3, target, nearMissFor("TOUGH")), "COMPLICATION");
});

test("a natural 20 and a natural 1 are outside the dial", () => {
  // A table that asked for gentle has not asked to stop feeling a natural 1,
  // and a table that asked for tough has not asked to give up their natural 20.
  // Both are the moments a child remembers; neither belongs to a setting.
  for (const challenge of ["GENTLE", "BALANCED", "TOUGH"] as ChallengeKey[]) {
    assert.equal(
      resolveCheck(request(challenge), statBlock({ grace: 1 }), () => 20).outcome,
      "CRITICAL",
      challenge,
    );
    assert.equal(
      resolveCheck(request(challenge), statBlock({ grace: 5 }), () => 1).outcome,
      "COMPLICATION",
      challenge,
    );
  }
});

test("the same roll lands differently on each setting, through the real check", () => {
  // Grace 3 is +0, so the total is the roll. A flat 11 against a NORMAL band:
  //   gentle  — beats 10, a success
  //   just right — one under 12, near enough to work at a cost
  //   tough   — three under 14, and only one under is forgiven there
  const stats = statBlock({ grace: 3 });
  assert.equal(resolveCheck(request("GENTLE"), stats, () => 11).outcome, "SUCCESS");
  assert.equal(resolveCheck(request("BALANCED"), stats, () => 11).outcome, "PARTIAL");
  assert.equal(resolveCheck(request("TOUGH"), stats, () => 11).outcome, "COMPLICATION");
});

test("the target it rolled against is the one reported, so the preview cannot lie", () => {
  // The check preview shows this number before the dice are thrown. If the
  // reported target and the target actually used ever came apart, the screen
  // would be telling a child one thing and the maths doing another.
  for (const challenge of ["GENTLE", "BALANCED", "TOUGH"] as ChallengeKey[]) {
    const result = resolveCheck(request(challenge), statBlock({ grace: 3 }), () => 11);
    assert.equal(result.target, targetFor("NORMAL", challenge), challenge);
  }
});

test("every setting offered on screen is one the rules know", () => {
  // The picker and the tables are in different files; this is what stops a
  // fourth option being added to one of them and silently doing nothing.
  for (const option of CHALLENGE_OPTIONS) {
    assert.notEqual(targetFor("NORMAL", option.value), undefined, option.value);
  }
  assert.deepEqual(
    CHALLENGE_OPTIONS.map((option) => option.value),
    ["GENTLE", "BALANCED", "TOUGH"],
  );
});
