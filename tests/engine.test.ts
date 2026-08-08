import assert from "node:assert/strict";
import test from "node:test";
import { DIFFICULTIES, describeResult, resolveCheck, resolveOutcome, rollD20, xpForOutcome } from "../lib/engine/dice.ts";
import { extractJsonText, parseLooseJson, requestStructured, StructuredOutputError } from "../lib/ai/json.ts";
import { buildContext, estimateTokens, rankMemories } from "../lib/ai/context.ts";
import { checkNarration } from "../lib/ai/safety.ts";
import type { StatKey } from "../lib/game/rules.ts";

// ---- Dice ------------------------------------------------------------------

const averageStats: Record<StatKey, number> = { might: 3, wits: 3, heart: 3, spark: 3 };

test("a natural 20 always criticals, however hard the task", () => {
  const result = resolveCheck(
    { characterId: "c", characterName: "Mira", stat: "might", difficulty: "HARD", intent: "lift the gate" },
    { might: 1, wits: 1, heart: 1, spark: 1 },
    () => 20,
  );
  assert.equal(result.outcome, "CRITICAL");
});

test("a natural 1 always complicates, however easy the task", () => {
  const result = resolveCheck(
    { characterId: "c", characterName: "Mira", stat: "might", difficulty: "EASY", intent: "open a door" },
    { might: 5, wits: 5, heart: 5, spark: 5 },
    () => 1,
  );
  assert.equal(result.outcome, "COMPLICATION");
});

test("a near miss is a partial success, not a flat failure", () => {
  // Roll 10, no modifier, vs NORMAL (12): missed by 2.
  const result = resolveCheck(
    { characterId: "c", characterName: "Mira", stat: "wits", difficulty: "NORMAL", intent: "work it out" },
    averageStats,
    () => 10,
  );
  assert.equal(result.total, 10);
  assert.equal(result.outcome, "PARTIAL");
});

test("missing by three or more is a complication", () => {
  const result = resolveCheck(
    { characterId: "c", characterName: "Mira", stat: "wits", difficulty: "NORMAL", intent: "work it out" },
    averageStats,
    () => 9,
  );
  assert.equal(result.outcome, "COMPLICATION");
});

test("stats and skills change the odds", () => {
  const base = resolveCheck(
    { characterId: "c", characterName: "Mira", stat: "heart", difficulty: "NORMAL", intent: "comfort them" },
    averageStats,
    () => 10,
  );
  const skilled = resolveCheck(
    {
      characterId: "c",
      characterName: "Mira",
      stat: "heart",
      difficulty: "NORMAL",
      intent: "comfort them",
      skillRank: 2,
      skillName: "Calm the Frightened",
    },
    { ...averageStats, heart: 5 },
    () => 10,
  );

  assert.equal(base.outcome, "PARTIAL");
  // +2 from heart 5, +2 from the skill: comfortably over the target.
  assert.equal(skilled.total, 14);
  assert.equal(skilled.outcome, "SUCCESS");
});

test("beating the target by five or more criticals", () => {
  assert.equal(resolveOutcome(15, DIFFICULTIES.NORMAL + 5, DIFFICULTIES.NORMAL), "CRITICAL");
});

test("every outcome awards some experience", () => {
  for (const outcome of ["CRITICAL", "SUCCESS", "PARTIAL", "COMPLICATION"] as const) {
    assert.ok(xpForOutcome(outcome) >= 1, `${outcome} should still be worth trying`);
  }
});

test("the roll description tells the model exactly what to narrate", () => {
  const result = resolveCheck(
    { characterId: "c", characterName: "Mira", stat: "might", difficulty: "HARD", intent: "heave the door" },
    averageStats,
    () => 4,
  );
  const text = describeResult(result);
  assert.match(text, /Mira/);
  assert.match(text, /COMPLICATION/);
  assert.match(text, /does not work/);
});

test("d20 stays within range across many rolls", () => {
  const seen = new Set<number>();
  for (let index = 0; index < 500; index += 1) {
    const roll = rollD20();
    assert.ok(roll >= 1 && roll <= 20, `rolled ${roll}`);
    seen.add(roll);
  }
  // 500 rolls hitting fewer than 15 distinct faces would signal a broken source.
  assert.ok(seen.size >= 15, `only ${seen.size} distinct faces`);
});

// ---- JSON extraction -------------------------------------------------------

test("reads clean JSON", () => {
  const parsed = parseLooseJson('{"checks": []}');
  assert.equal(parsed.ok, true);
});

test("reads JSON out of a markdown fence", () => {
  const parsed = parseLooseJson('Sure!\n```json\n{"a": 1}\n```\nHope that helps.');
  assert.deepEqual(parsed.ok && parsed.value, { a: 1 });
});

test("reads JSON with prose wrapped around it", () => {
  const parsed = parseLooseJson('Here is the result: {"a": 1} — let me know if you need more.');
  assert.deepEqual(parsed.ok && parsed.value, { a: 1 });
});

test("tolerates trailing commas", () => {
  const parsed = parseLooseJson('{"a": 1, "b": [1, 2,],}');
  assert.deepEqual(parsed.ok && parsed.value, { a: 1, b: [1, 2] });
});

test("is not confused by braces inside strings", () => {
  const parsed = parseLooseJson('{"intent": "say {hello} to the fox"}');
  assert.deepEqual(parsed.ok && parsed.value, { intent: "say {hello} to the fox" });
});

test("finds the object even when a stray brace precedes it", () => {
  assert.equal(extractJsonText("} oops {\"a\": 1}"), '{"a": 1}');
});

test("reports failure when there is no JSON at all", () => {
  const parsed = parseLooseJson("I'm sorry, I can't do that.");
  assert.equal(parsed.ok, false);
});

// ---- The repair loop -------------------------------------------------------

test("accepts a good first response without repairing", async () => {
  let calls = 0;
  const result = await requestStructured<{ a: number }>({
    call: async () => {
      calls += 1;
      return '{"a": 1}';
    },
    validate: (value) => ({ ok: true, value: value as { a: number } }),
  });

  assert.equal(calls, 1);
  assert.equal(result.repairs, 0);
});

test("repairs once when the first response is the wrong shape", async () => {
  const responses = ["not json at all", '{"a": 1}'];
  let calls = 0;
  let sawHint = false;

  const result = await requestStructured<{ a: number }>({
    call: async (hint) => {
      if (hint) sawHint = true;
      return responses[calls++];
    },
    validate: (value) =>
      typeof (value as { a?: unknown }).a === "number"
        ? { ok: true, value: value as { a: number } }
        : { ok: false, error: "a must be a number" },
  });

  assert.equal(calls, 2);
  assert.equal(result.repairs, 1);
  assert.ok(sawHint, "the repair attempt must tell the model what was wrong");
});

test("gives up after the repair budget and reports the raw text", async () => {
  await assert.rejects(
    requestStructured({
      call: async () => "still not json",
      validate: () => ({ ok: false, error: "nope" }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StructuredOutputError);
      assert.match(error.message, /did not return usable JSON/);
      assert.equal(error.raw, "still not json");
      return true;
    },
  );
});

// ---- Context assembly ------------------------------------------------------

const baseContext = {
  campaignTitle: "The Naming Flight",
  storylineTitle: "The Dragon Who Lost Her Name",
  premise: "A dragon has lost her name.",
  actTitle: "The Dragon in the Barley",
  actGoal: "Earn her trust.",
  actBeats: ["She hides under the beans"],
  party: [
    {
      name: "Mira",
      race: "Halfling",
      archetype: "Beastfriend",
      pronouns: "she/her",
      ageBand: "CHILD",
      level: 1,
      stats: { might: 1, wits: 3, heart: 5, spark: 3 },
      skills: [{ name: "Speak with Animals", rank: 1 }],
    },
  ],
  bonds: [],
  location: "the barley field",
  sceneSummary: null,
  priorScenes: [],
  memories: [],
  recentTurns: [],
  currentTurnCounter: 0,
  maxTokens: 2000,
};

test("context always carries the story, the chapter and the party", () => {
  const built = buildContext(baseContext);
  assert.match(built.text, /The Naming Flight/);
  assert.match(built.text, /The Dragon in the Barley/);
  assert.match(built.text, /Mira/);
  assert.match(built.text, /Heart 5/);
  assert.match(built.text, /Speak with Animals/);
});

test("memories rank by importance before recency", () => {
  const ranked = rankMemories(
    [
      { kind: "FACT", key: "old-but-central", content: "x", importance: 5, lastSeenAt: 1 },
      { kind: "FACT", key: "recent-trivia", content: "y", importance: 1, lastSeenAt: 20 },
    ],
    20,
  );
  assert.equal(ranked[0].key, "old-but-central");
});

test("recency breaks ties at equal importance", () => {
  const ranked = rankMemories(
    [
      { kind: "FACT", key: "stale", content: "x", importance: 3, lastSeenAt: 1 },
      { kind: "FACT", key: "fresh", content: "y", importance: 3, lastSeenAt: 19 },
    ],
    20,
  );
  assert.equal(ranked[0].key, "fresh");
});

test("a tight budget drops history but never the party or the chapter", () => {
  const built = buildContext({
    ...baseContext,
    maxTokens: 400,
    memories: Array.from({ length: 40 }, (_, index) => ({
      kind: "FACT",
      key: `fact-${index}`,
      content: "Something that happened a while ago and is quite wordy indeed.",
      importance: 2,
      lastSeenAt: 0,
    })),
    recentTurns: Array.from({ length: 40 }, (_, index) => ({
      type: "NARRATION" as const,
      content: `Turn ${index}. ` + "The story continued at some length. ".repeat(5),
    })),
  });

  assert.match(built.text, /Mira/, "the party must survive trimming");
  assert.match(built.text, /The Dragon in the Barley/, "the chapter must survive trimming");
  assert.ok(built.trimmed.turns > 0 || built.trimmed.memories > 0, "something should have been trimmed");
  // Allow modest overshoot: the header is never dropped, so a very small
  // budget can still be exceeded by the fixed layers alone.
  assert.ok(built.estimatedTokens < 900, `context was ${built.estimatedTokens} tokens`);
});

test("the most recent turn survives when older ones are trimmed", () => {
  const built = buildContext({
    ...baseContext,
    maxTokens: 500,
    recentTurns: [
      { type: "NARRATION", content: "OLDEST. " + "padding ".repeat(200) },
      { type: "NARRATION", content: "NEWEST — this must survive." },
    ],
  });

  assert.match(built.text, /NEWEST/);
  assert.ok(!built.text.includes("OLDEST"), "the oldest turn should have been dropped first");
});

test("token estimation is proportional to length", () => {
  assert.ok(estimateTokens("a".repeat(400)) > estimateTokens("a".repeat(40)));
});

// ---- Safety ----------------------------------------------------------------

test("passes ordinary wholesome narration", () => {
  assert.equal(checkNarration("You push open the gate. The fox blinks at you.").ok, true);
});

test("catches death and harm", () => {
  for (const text of [
    "The goblin dies at your feet.",
    "There was blood on the stones.",
    "You kill the creature.",
  ]) {
    assert.equal(checkNarration(text).ok, false, `should have caught: ${text}`);
  }
});

test("does not trip on innocent phrases containing flagged words", () => {
  for (const text of [
    "The corridor came to a dead end.",
    "Dead leaves crunched underfoot.",
    "You wait in the dead of night.",
    "A bloodhound snuffles at the door.",
  ]) {
    assert.equal(checkNarration(text).ok, true, `should have allowed: ${text}`);
  }
});
