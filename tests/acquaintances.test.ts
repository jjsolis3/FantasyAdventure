import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MAX_OFFERED,
  MAX_PER_ADVENTURE,
  MEMORABLE_ENOUGH,
  acquaintanceKey,
  metMessage,
  renderKnownPeople,
  whoComesHome,
  type KnownPerson,
} from "../lib/game/acquaintances.ts";

function npc(key: string, importance = 4, content = "Keeps bees and is afraid of the dark.") {
  return { key, content, importance };
}

// ---- Recognising the same person again --------------------------------------

test("acquaintances: the same person spelled four ways is one person", () => {
  // The storyteller will not write them the same way twice across two stories.
  const keys = ["the beekeeper", "Beekeeper", "the old beekeeper", "  The  Beekeeper  "].map(
    acquaintanceKey,
  );

  assert.equal(new Set(keys).size, 1, keys.join(" | "));
});

test("acquaintances: two different people stay two people", () => {
  assert.notEqual(acquaintanceKey("the beekeeper"), acquaintanceKey("the bridge troll"));
});

test("acquaintances: punctuation and case do not make a stranger", () => {
  assert.equal(acquaintanceKey("Mrs. Ashby!"), acquaintanceKey("mrs ashby"));
});

// ---- Who comes home ---------------------------------------------------------

test("acquaintances: only the ones who mattered follow the party home", () => {
  // An adventure remembers a dozen names, most of them walk-ons. If all of them
  // came along, the list would be noise within two stories.
  const coming = whoComesHome([
    npc("the beekeeper", 5),
    npc("a stallholder", 2),
    npc("a voice through a door", 1),
  ]);

  assert.deepEqual(
    coming.map((person) => person.key),
    ["the beekeeper"],
  );
});

test("acquaintances: the threshold admits the middle of the range", () => {
  // Importance defaults to 3, so somebody who mattered quietly still counts.
  assert.equal(whoComesHome([npc("the miller", MEMORABLE_ENOUGH)]).length, 1);
  assert.equal(whoComesHome([npc("the miller", MEMORABLE_ENOUGH - 1)]).length, 0);
});

test("acquaintances: the most memorable come first, and only a handful", () => {
  const many = Array.from({ length: 10 }, (_, index) => npc(`person ${index}`, 3 + (index % 3)));
  const coming = whoComesHome(many);

  assert.equal(coming.length, MAX_PER_ADVENTURE);
  assert.ok(coming.every((person) => person.importance >= 4), "the least memorable were dropped");
});

test("acquaintances: somebody recorded twice arrives once", () => {
  const coming = whoComesHome([npc("the beekeeper", 5), npc("Beekeeper", 4)]);

  assert.equal(coming.length, 1);
  assert.equal(coming[0].key, "the beekeeper", "keeps the more memorable spelling");
});

test("acquaintances: a nameless entry is not a person", () => {
  assert.equal(whoComesHome([npc("a", 5), npc("", 5)]).length, 0);
});

test("acquaintances: a first adventure with nobody memorable brings nobody", () => {
  assert.deepEqual(whoComesHome([]), []);
});

// ---- What the storyteller is told -------------------------------------------

function known(overrides: Partial<KnownPerson> = {}): KnownPerson {
  return {
    name: "the beekeeper",
    about: "Keeps bees and is afraid of the dark.",
    metInCampaignTitle: "The Star in Grandma's Garden",
    timesMet: 1,
    knownBy: ["Mira"],
    ...overrides,
  };
}

test("acquaintances: a family's first adventure costs nothing", () => {
  // Most adventures are somebody's first, and this should add no prompt at all.
  assert.equal(renderKnownPeople([]), "");
});

test("acquaintances: a reunion is offered, never required", () => {
  // A chapter bent around an old acquaintance because the prompt insisted is
  // worse than one that never mentions them.
  const block = renderKnownPeople([known()]);

  assert.match(block, /You may bring ONE/);
  assert.match(block, /do not bend the chapter/i);
  assert.match(block, /the beekeeper/);
});

test("acquaintances: it says who knows them, so the reunion can be personal", () => {
  const block = renderKnownPeople([known({ knownBy: ["Mira", "Rowan"] })]);
  assert.match(block, /Mira and Rowan know them/);
});

test("acquaintances: meeting somebody repeatedly reads differently", () => {
  const once = renderKnownPeople([known({ timesMet: 1 })]);
  const thrice = renderKnownPeople([known({ timesMet: 3 })]);

  assert.ok(!once.includes("adventures now"));
  assert.match(thrice, /3 of this family's adventures now/);
});

test("acquaintances: a long list is trimmed before it reaches the model", () => {
  // A model handed twelve old friends will try to fit several into one chapter.
  const many = Array.from({ length: 12 }, (_, index) => known({ name: `person ${index}` }));
  const block = renderKnownPeople(many);

  assert.equal(block.split("\n").length - 1, MAX_OFFERED);
});

test("acquaintances: the table is told who came home with them", () => {
  assert.equal(metMessage([]), "");
  assert.equal(
    metMessage(["the beekeeper"]),
    "You will remember the beekeeper — and they will remember you.",
  );
  assert.equal(
    metMessage(["the beekeeper", "the bridge troll"]),
    "You will remember the beekeeper and the bridge troll — and they will remember you.",
  );
});
