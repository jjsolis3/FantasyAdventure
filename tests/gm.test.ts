import assert from "node:assert/strict";
import test from "node:test";
import { runTurn, type ModelCalls, type TurnInput } from "../lib/engine/gm.ts";
import { statBlock } from "../lib/game/rules.ts";

const party: TurnInput["party"] = [
  {
    id: "mira",
    name: "Mira Thistledown",
    stats: statBlock({ might: 1, wits: 3, heart: 5, spark: 3 }),
    skills: [{ name: "Speak with Animals", rank: 2 }],
  },
  {
    id: "rowan",
    name: "Rowan",
    stats: statBlock({ might: 5, wits: 3, heart: 3, spark: 1 }),
    skills: [],
  },
];

const baseInput: TurnInput = {
  context: "ADVENTURE: test",
  tone: "ADVENTUROUS",
  readingLevel: "MIDDLE_GRADE",
  sceneText: "A dragon sits in the barley.",
  party,
  actions: [
    { characterId: "mira", text: "I hum to the dragon." },
    { characterId: "rowan", text: "I heave the gate open." },
  ],
};

/** Builds a stub model that returns scripted replies per stage. */
function stub(options: {
  adjudication?: string;
  narration?: string;
  extraction?: string;
  onProse?: (prompt: string) => string;
}): ModelCalls & { jsonPrompts: string[]; prosePrompts: string[] } {
  const jsonPrompts: string[] = [];
  const prosePrompts: string[] = [];

  return {
    jsonPrompts,
    prosePrompts,
    async json(prompt) {
      jsonPrompts.push(prompt);
      // The two JSON stages are told apart by what the prompt asks for.
      const isExtraction = prompt.includes("extract what should be remembered");
      return isExtraction
        ? (options.extraction ??
            '{"sceneTitle":null,"location":null,"memories":[],"bondMoments":[],"actComplete":false,"sceneComplete":false}')
        : (options.adjudication ?? '{"checks":[],"automatic":[]}');
    },
    async prose(_system, prompt) {
      prosePrompts.push(prompt);
      if (options.onProse) return options.onProse(prompt);
      return options.narration ?? "The dragon lifts her head and looks at you.";
    },
  };
}

test("rolls the dice the adjudicator asked for", async () => {
  const calls = stub({
    adjudication:
      '{"checks":[{"character":"Mira Thistledown","stat":"heart","difficulty":"NORMAL","intent":"hum to the dragon"}],"automatic":[{"character":"Rowan","effect":"heaves the gate"}]}',
  });

  const result = await runTurn(baseInput, calls, () => 10);

  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].characterId, "mira");
  // heart 5 gives +2; roll 10 + 2 = 12, exactly NORMAL.
  assert.equal(result.checks[0].total, 12);
  assert.equal(result.checks[0].outcome, "SUCCESS");
});

test("the narration prompt is told the dice outcome verbatim", async () => {
  const calls = stub({
    adjudication:
      '{"checks":[{"character":"Rowan","stat":"might","difficulty":"HARD","intent":"heave the gate"}],"automatic":[]}',
  });

  await runTurn(baseInput, calls, () => 2);

  const prompt = calls.prosePrompts[0];
  assert.match(prompt, /COMPLICATION/);
  assert.match(prompt, /must genuinely not work/);
});

test("matches shortened character names back to the party", async () => {
  const calls = stub({
    // The model says "Mira", not "Mira Thistledown".
    adjudication:
      '{"checks":[{"character":"Mira","stat":"heart","difficulty":"EASY","intent":"hum"}],"automatic":[]}',
  });

  const result = await runTurn(baseInput, calls, () => 10);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].characterId, "mira");
});

test("silently drops checks for characters who are not in the party", async () => {
  const calls = stub({
    adjudication:
      '{"checks":[{"character":"Gandalf","stat":"spark","difficulty":"HARD","intent":"cast a spell"}],"automatic":[]}',
  });

  const result = await runTurn(baseInput, calls, () => 10);
  assert.equal(result.checks.length, 0, "an invented character must not produce a roll");
});

test("applies a relevant skill bonus", async () => {
  const calls = stub({
    adjudication:
      '{"checks":[{"character":"Mira Thistledown","stat":"heart","difficulty":"NORMAL","intent":"Speak with Animals to calm her"}],"automatic":[]}',
  });

  const result = await runTurn(baseInput, calls, () => 10);
  assert.equal(result.checks[0].skillBonus, 2);
  assert.equal(result.checks[0].skillName, "Speak with Animals");
});

test("a failed adjudication still produces a turn, without dice", async () => {
  const calls: ModelCalls = {
    async json(prompt) {
      if (prompt.includes("extract what should be remembered")) {
        return '{"memories":[],"bondMoments":[]}';
      }
      return "I'm afraid I can't help with that.";
    },
    async prose() {
      return "The dragon lifts her head.";
    },
  };

  const result = await runTurn(baseInput, calls);

  assert.equal(result.diagnostics.adjudicationFellBack, true);
  assert.equal(result.checks.length, 0);
  // Everything the players declared still happens.
  assert.equal(result.adjudication.automatic.length, 2);
  assert.ok(result.narration.length > 0, "the table still gets a story");
});

test("a failed extraction still produces a turn, without bookkeeping", async () => {
  const calls: ModelCalls = {
    async json(prompt) {
      if (prompt.includes("extract what should be remembered")) return "no json here";
      return '{"checks":[],"automatic":[]}';
    },
    async prose() {
      return "The dragon lifts her head.";
    },
  };

  const result = await runTurn(baseInput, calls);

  assert.equal(result.diagnostics.extractionFellBack, true);
  assert.deepEqual(result.extraction.memories, []);
  assert.ok(result.narration.length > 0);
});

test("unsafe narration is regenerated once", async () => {
  let attempt = 0;
  const calls = stub({
    onProse: () => {
      attempt += 1;
      return attempt === 1
        ? "The goblin dies at your feet."
        : "The goblin sits down heavily and starts to cry.";
    },
  });

  const result = await runTurn(baseInput, calls);

  assert.equal(result.diagnostics.safetyRegenerated, true);
  assert.match(result.narration, /starts to cry/);
  assert.match(calls.prosePrompts[1], /not allowed in this game/);
});

test("narration that trips the guard twice is scrubbed rather than shown", async () => {
  const calls = stub({ onProse: () => "The goblin dies. Again it dies." });
  const result = await runTurn(baseInput, calls);

  assert.equal(result.diagnostics.safetyRegenerated, true);
  assert.ok(!/\bdies\b/.test(result.narration), `still unsafe: ${result.narration}`);
});

test("bond moments naming someone outside the party are discarded", async () => {
  const calls = stub({
    extraction:
      '{"sceneTitle":null,"location":null,"memories":[],"bondMoments":[{"from":"Mira Thistledown","to":"Gandalf","why":"helped"},{"from":"Rowan","to":"Mira Thistledown","why":"steadied her"}],"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(baseInput, calls);

  assert.equal(result.extraction.bondMoments.length, 1);
  assert.equal(result.extraction.bondMoments[0].from, "Rowan");
});

test("a character cannot earn a bond with themselves", async () => {
  const calls = stub({
    extraction:
      '{"sceneTitle":null,"location":null,"memories":[],"bondMoments":[{"from":"Mira","to":"Mira Thistledown","why":"self care"}],"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(baseInput, calls);
  assert.equal(result.extraction.bondMoments.length, 0);
});

test("missing optional fields are defaulted rather than rejected", async () => {
  // A small model omitting half the schema is the common case, not the rare one.
  const calls = stub({ extraction: '{"memories":[]}' });

  const result = await runTurn(baseInput, calls);

  assert.equal(result.diagnostics.extractionFellBack, false);
  assert.equal(result.extraction.actComplete, false);
  assert.deepEqual(result.extraction.bondMoments, []);
});

test("a deflection note reaches the narration prompt", async () => {
  const calls = stub({});
  await runTurn({ ...baseInput, deflectionNote: "DEFLECT THIS" }, calls);
  assert.match(calls.prosePrompts[0], /DEFLECT THIS/);
});

test("a deed cannot be reported when nothing was asked about", async () => {
  // Without a board there is nothing "deedsDone" could be describing, whatever
  // the model felt like claiming.
  const calls = stub({
    extraction:
      '{"memories":[],"deedsDone":["they fixed the mill wheel"],"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(baseInput, calls);
  assert.deepEqual(result.extraction.deedsDone, []);
});

test("a deed is kept when the party was asked about one", async () => {
  const calls = stub({
    extraction:
      '{"memories":[],"deedsDone":["they fixed the mill wheel"],"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(
    { ...baseInput, openDeeds: ["Get the mill wheel turning again"] },
    calls,
  );
  assert.deepEqual(result.extraction.deedsDone, ["they fixed the mill wheel"]);
});

test("open deeds are put in front of the storyteller", async () => {
  const calls = stub({});
  await runTurn({ ...baseInput, openDeeds: ["Get the mill wheel turning again"] }, calls);

  const extraction = calls.jsonPrompts.find((prompt) =>
    prompt.includes("extract what should be remembered"),
  );
  assert.ok(
    extraction?.includes("Get the mill wheel turning again"),
    "the board was not shown to the extraction step",
  );
});

test("a side quest the storyteller opens survives extraction", async () => {
  const calls = stub({
    extraction:
      '{"memories":[],"questsOpened":[{"title":"The Missing Cat","summary":"The baker has lost her cat.",' +
      '"objectives":[{"kind":"FIND","text":"the baker\'s cat"}]}],"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(baseInput, calls);

  assert.equal(result.extraction.questsOpened.length, 1);
  assert.equal(result.extraction.questsOpened[0].title, "The Missing Cat");
  assert.equal(result.extraction.questsOpened[0].objectives[0].kind, "FIND");
});

test("the storyteller's question comes back with the turn", async () => {
  const calls = stub({
    extraction:
      '{"memories":[],"whatNow":"The door is open an inch. Do you go in?",' +
      '"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(baseInput, calls);

  assert.equal(result.extraction.whatNow, "The door is open an inch. Do you go in?");
});

test("a storyteller that forgets to ask anything is not an error", async () => {
  // Every optional field here has to survive being left out — a small model
  // omits things, and losing the whole turn's bookkeeping over a missing
  // sentence would be a poor trade.
  const calls = stub({
    extraction: '{"memories":[],"actComplete":false,"sceneComplete":false}',
  });

  const result = await runTurn(baseInput, calls);

  assert.equal(result.extraction.whatNow ?? null, null);
});

test("the extraction step is asked for the question", async () => {
  const calls = stub({});
  await runTurn(baseInput, calls);

  const extraction = calls.jsonPrompts.find((prompt) =>
    prompt.includes("extract what should be remembered"),
  );
  assert.ok(extraction?.includes("whatNow"), "the question was not asked for");
});
