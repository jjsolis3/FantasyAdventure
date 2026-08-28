import test from "node:test";
import assert from "node:assert/strict";
import { closenessNote, companionNote, countsTowardCloseness } from "../lib/game/companions.ts";
import { extractionSchema } from "../lib/ai/schemas.ts";

const woody = { owner: "Mira", name: "Woody", kind: "a wooden owl", knack: "seeing in the dark" };

test("nothing is allowed to happen to them, and that is said first", () => {
  // The line this whole feature has to hold. A companion is exactly what a
  // storyteller reaches for when it wants stakes without hurting a child's
  // character, so the forbidding has to arrive before anything else — a 7B
  // model reads the top of a block far more reliably than the middle.
  const note = companionNote([woody]);

  assert.match(note, /NOTHING HAPPENS TO THESE/);
  assert.match(note, /never hurt, never taken, never lost/);
  assert.match(note, /Do not threaten\s+one to raise the tension/);

  // And it is still told to actually use them, or a companion becomes a line
  // in a prompt that never appears in a story.
  assert.match(note, /they are present, they have opinions/);
  assert.match(note, /never solve the problem for the party/);
});

test("who it belongs to is part of the line", () => {
  // Two sisters with two companions is the ordinary case, and "Woody" with no
  // owner attached is how a storyteller ends up giving him to the wrong girl.
  const note = companionNote([woody, { owner: "Rowan", name: "Bramble", kind: "a goose", knack: "shouting" }]);
  assert.match(note, /Woody, a wooden owl, with Mira/);
  assert.match(note, /Bramble, a goose, with Rowan/);
});

test("nothing at all when nobody has one", () => {
  assert.equal(companionNote([]), "");
});

test("closeness counts chapters, not turns", () => {
  // A table that plays sixteen turns in one sitting has not had more of a
  // friendship than one that played four.
  const fresh = { countedCampaignId: null, countedActIndex: null };
  assert.equal(countsTowardCloseness(fresh, "c1", 1), true);

  const counted = { countedCampaignId: "c1", countedActIndex: 1 };
  assert.equal(countsTowardCloseness(counted, "c1", 1), false, "not twice in one chapter");
  assert.equal(countsTowardCloseness(counted, "c1", 2), true, "the next chapter counts");
  assert.equal(countsTowardCloseness(counted, "c2", 1), true, "so does another adventure");
});

test("the sheet says how long it has been going on", () => {
  assert.match(closenessNote({ ...woody, closeness: 0 }), /only just started/);
  assert.match(closenessNote({ ...woody, closeness: 1 }), /one chapter/);
  assert.match(closenessNote({ ...woody, closeness: 7 }), /7 chapters/);
});

test("closeness buys nothing, and there is nowhere for it to", () => {
  // The moment it grants a bonus it stops being a friendship and becomes a
  // level — and every child ends up with the same companion, optimised. The
  // guard is that nothing in the rules module returns a number to add.
  const note = companionNote([woody]);
  assert.doesNotMatch(note, /\+\d/, "no bonus is offered to the storyteller");
  assert.doesNotMatch(note, /roll|dice|check/i, "and the dice are never mentioned");
});

test("finding one is rare, and shaped so it cannot be half a companion", () => {
  const found = extractionSchema.parse({
    companionFound: {
      character: "Mira",
      name: "Woody",
      kind: "a wooden owl",
      knack: "seeing in the dark",
    },
  });
  assert.equal(found.companionFound?.name, "Woody");

  // Every turn before companions existed still parses and reports none.
  assert.equal(extractionSchema.parse({}).companionFound ?? null, null);

  // A companion with no talent is refused outright rather than stored empty —
  // the knack is the whole of what makes it a character rather than a prop.
  const half = extractionSchema.safeParse({
    companionFound: { character: "Mira", name: "Woody", kind: "a wooden owl", knack: "" },
  });
  assert.equal(half.success, false);
});
