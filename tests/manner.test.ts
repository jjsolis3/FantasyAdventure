import test from "node:test";
import assert from "node:assert/strict";
import { adjudicationPrompt, systemPrompt, type MannerKey } from "../lib/ai/prompts.ts";
import { MANNER_OPTIONS } from "../components/campaign/options.ts";

const EVERY_MANNER: MannerKey[] = ["STRAIGHT", "BALANCED", "PLAYFUL", "MADCAP"];

const narratorFor = (manner?: MannerKey) =>
  systemPrompt({ tone: "ADVENTUROUS", readingLevel: "MIDDLE_GRADE", manner });

test("the manner reaches the storyteller", () => {
  assert.match(narratorFor("MADCAP"), /MANNER:/);
  assert.match(narratorFor("MADCAP"), /gleefully ridiculous/i);
  assert.match(narratorFor("STRAIGHT"), /Play it straight/i);
  assert.match(narratorFor("PLAYFUL"), /Comic timing/i);
});

test("the middle one says nothing at all", () => {
  // An instruction to be ordinary reads as a request for blandness, and a
  // labelled heading with nothing under it is an invitation for a small model
  // to invent something to put there. So the whole line is absent.
  assert.doesNotMatch(narratorFor("BALANCED"), /MANNER:/);
  assert.doesNotMatch(narratorFor(undefined), /MANNER:/);

  // And an unset manner is byte-identical to the middle one, which is what
  // makes the migration's default a true no-op for every adventure in flight.
  assert.equal(narratorFor(undefined), narratorFor("BALANCED"));
});

test("the manner never reaches the adjudicator", () => {
  // The claim this whole file exists for.
  //
  // The adjudicator decides what a girl's own sentence means and how hard it
  // is. It once turned "I go back to the table to check the album" into going
  // back quietly, unseen, and then failed her on the sneaking she never said
  // she was doing. The standing order against that is in its prompt.
  //
  // A storyteller told to be wilder is exactly the pressure that re-opens it.
  // So the wildness goes to the telling and never to the reading: making the
  // world sillier must not make the reading of what she wrote looser.
  const adjudication = adjudicationPrompt({
    sceneText: "The barn door is open by one inch more than it was.",
    party: "Mira — grace 4",
    actions: [{ character: "Mira", text: "I go back to the table to check the album." }],
  });

  assert.doesNotMatch(adjudication, /MANNER/i);
  for (const phrase of [/gleefully ridiculous/i, /Comic timing/i, /Play it straight/i]) {
    assert.doesNotMatch(adjudication, phrase, String(phrase));
  }

  // The order it must keep instead.
  assert.match(adjudication, /Never add a condition, a constraint or a risk they did not\s+mention/);
});

test("no manner talks the storyteller out of the core contract", () => {
  // Each one is added to the same prompt that carries the promise nobody is
  // hurt. "The world says yes to anything" is the one most likely to argue
  // with that, so all four are checked rather than trusted.
  for (const manner of EVERY_MANNER) {
    const prompt = narratorFor(manner);
    assert.match(prompt, /nobody dies, nothing is cruel/, manner);
    assert.match(prompt, /you narrate the dice result you are given/, manner);
  }

  // And the loudest one says out loud whose expense the joke is never at.
  assert.match(narratorFor("MADCAP"), /never one of the children/i);
});

test("every manner offered on screen is one the prompt knows", () => {
  // The picker and the guidance live in different files. Without this, a fifth
  // option could be added to the menu and quietly do nothing at all.
  for (const option of MANNER_OPTIONS) {
    const prompt = narratorFor(option.value);
    if (option.value === "BALANCED") {
      assert.doesNotMatch(prompt, /MANNER:/);
    } else {
      assert.match(prompt, /MANNER:/, option.value);
    }
  }
  assert.deepEqual(MANNER_OPTIONS.map((option) => option.value), EVERY_MANNER);
});
