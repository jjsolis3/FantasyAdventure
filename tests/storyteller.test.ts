import assert from "node:assert/strict";
import test from "node:test";
import {
  adjudicationPrompt,
  extractionPrompt,
  narrationPrompt,
  systemPrompt,
} from "../lib/ai/prompts.ts";
import { buildContext } from "../lib/ai/context.ts";

/**
 * The prompt regressions found by reading a real evening's transcript.
 *
 * Ten turns, three players, and every one of the complaints turned out to be a
 * particular line: a paragraph per character, a closing inventory sentence, and
 * quest objects handed over as prizes for good rolls. These tests hold the
 * corrections in place, because a prompt has no type system and the only thing
 * standing between a fixed rule and a quietly reverted one is a test.
 */

const system = systemPrompt({ tone: "SPOOKY", readingLevel: "FAMILY_MIXED" });

/** The evening this all came from, as the smallest context that builds. */
function contextWith(extra: Partial<Parameters<typeof buildContext>[0]>): string {
  return buildContext({
    campaignTitle: "Every Photograph Is Wrong",
    storylineTitle: "The Star Thief",
    premise: "Something is one row nearer in every photograph.",
    actTitle: "The Porch Discovery",
    actGoal: "Work out what is in the photographs.",
    actBeats: [],
    party: [],
    bonds: [],
    priorScenes: [],
    memories: [],
    recentTurns: [],
    currentTurnCounter: 1,
    maxTokens: 4000,
    ...extra,
  }).text;
}

// ---- One story, not three ---------------------------------------------------

test("the storyteller is told to write one scene, not one paragraph each", () => {
  assert.match(system, /ONE STORY, NOT THREE/);
  assert.match(system, /Never write a paragraph per character/);
  assert.match(system, /put both names in ONE sentence/);
});

test("and the old blanket instruction is gone from both places", () => {
  // "Cover every character's action" and "give every character something to do"
  // are what produced Orin-paragraph, Twinkle-paragraph, Ember-paragraph, ten
  // times out of ten.
  assert.doesNotMatch(system, /Give every character something to do or notice/);

  const narrate = narrationPrompt({
    context: "a kitchen",
    actions: [{ character: "Mira", text: "I open the cupboard." }],
    resolutions: "Mira: it worked",
  });
  assert.doesNotMatch(narrate, /Cover every character's action/);
  assert.match(narrate, /as ONE scene rather than one paragraph per person/);
});

test("everybody still has to appear — this is not permission to drop somebody", () => {
  assert.match(system, /Everybody must be somewhere in the passage/);
});

// ---- The closing inventory --------------------------------------------------

test("the three-noun rule no longer asks for a list in the prose", () => {
  // The rule was right and the placement was wrong: it lived in the narration
  // system prompt, so the model appended a literal stock check to every passage
  // — "a clock ticks, a floorboard creaks, and a key rests on the box" — which
  // restated the paragraph above it instead of pointing anywhere new.
  assert.doesNotMatch(system, /must leave at least THREE specific things/);
  assert.match(system, /NEVER as a list/);
  assert.match(system, /started reading\s+out a stock check/);

  const narrate = narrationPrompt({
    context: "a kitchen",
    actions: [{ character: "Mira", text: "I look around." }],
    resolutions: "Nothing needed a dice roll this turn.",
  });
  assert.match(narrate, /no closing sentence that lists what is in the room/);
});

test("but extraction still collects them, because the chips are the right home", () => {
  const prompt = extractionPrompt({ narration: "The shutter is shut.", partyNames: ["Mira"] });
  assert.match(prompt, /"onTheTable"/);
  assert.match(prompt, /NOT hints and NOT instructions/);
});

// ---- What a good roll may give ----------------------------------------------

test("a critical is bounded, so it stops handing out presents", () => {
  assert.match(system, /WHAT A GOOD ROLL IS ALLOWED TO GIVE/);
  assert.match(system, /NEVER invent a bonus object nobody was looking for/);
  assert.match(system, /One good thing per good roll/);
});

test("and it may never hand over the thing the party is looking for", () => {
  // The evening that found this: three separate jars of coffee beans turned up
  // for one objective that asked for one, each as a reward for rolling well.
  assert.match(system, /NEVER hand over anything the party is currently trying to find/);
  assert.match(system, /Picking it up is a turn somebody has to take/);
});

test("the context says where a find lives rather than who gets handed it", () => {
  const context = contextWith({ actSeeks: ["a camera that still takes film"] });

  assert.match(context, /leave it there until somebody actually goes and gets it/);
  assert.match(context, /never place it in front of whoever happens to be rolling/);
  assert.match(context, /never put the same thing in two places/);
});

test("a personal aim gets one opening, not one every turn", () => {
  const context = contextWith({
    personalAims: [{ character: "Orin", aim: "make a really good cup of coffee" }],
  });

  assert.match(context, /an aim the world keeps offering is an aim nobody achieved/);
});

// ---- Noticing that they worked together -------------------------------------

test("the adjudicator knows that asking somebody for something is one plan", () => {
  // The commonest form at a real table and the one it missed: "pass me the
  // album" plus anything from the person asked. On paper it reads as two
  // separate sentences, which is exactly why it needs saying.
  const prompt = adjudicationPrompt({
    sceneText: "The kitchen, and a hallway nobody wants to walk down.",
    party: "Orin, Twinkle Toes, Ember Kindwell",
    actions: [
      { character: "Orin", text: "I ask Twinkle Toes to pass me the family album." },
      { character: "Twinkle Toes", text: "I ask Ember to crochet a book cover." },
    ],
  });

  assert.match(prompt, /ONE ASKS ANOTHER FOR SOMETHING/);
  assert.match(prompt, /One makes, fetches, mends or carries something FOR another/);
  // And it no longer talks itself out of looking.
  assert.doesNotMatch(prompt, /\[\] is the right answer most turns/);
  assert.match(prompt, /do not be stingy either/);
});

test("a bond moment is more than somebody being rescued", () => {
  // All three bonds sat at zero after ten turns in which one girl crocheted a
  // hat for another. Making somebody a hat is the game working.
  const prompt = extractionPrompt({
    narration: "Ember shapes a fox hat for Twinkle Toes.",
    partyNames: ["Ember", "Twinkle Toes"],
  });

  assert.match(prompt, /one MADE or FETCHED something for the other/);
  assert.match(prompt, /Making somebody a hat is a bond moment/);
  assert.match(prompt, /one asked the other for something and got it/);
});
