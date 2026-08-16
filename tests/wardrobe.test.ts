import test from "node:test";
import assert from "node:assert/strict";
import {
  SLOTS,
  WARDROBE,
  columnFor,
  earnedWearables,
  hasLook,
  inkFor,
  lookColumns,
  lookOf,
  lookSentence,
} from "../lib/game/wardrobe.ts";
import { characterPicture, lookKey } from "../lib/game/character-picture.ts";
import { portraitPrompt } from "../lib/ai/images.ts";

/**
 * The wardrobe, and the ladder that turns it into a face.
 *
 * The sentence is the load-bearing thing here: the sheet, the storyteller's
 * prompt and the drawing request all read it, so a change to it changes what
 * three separate surfaces say about somebody's daughter's adventurer.
 */

// ---- The sentence -----------------------------------------------------------

test("wardrobe: nothing chosen is an empty sentence, not an awkward one", () => {
  assert.equal(lookSentence({}), "");
  assert.equal(lookSentence({}, "Mira"), "");
  assert.equal(hasLook({}), false);
});

test("wardrobe: half a look is a look", () => {
  assert.equal(hasLook({ colour: "moss green" }), true);
  assert.equal(lookSentence({ colour: "moss green" }, "Mira"), "Mira, all in moss green.");
});

test("wardrobe: the colour attaches to what it can sensibly colour", () => {
  // Over the top wins when there is one — it is the layer somebody sees.
  assert.match(
    lookSentence({ outfit: "a plain dress with deep pockets", layer: "a hooded travelling cloak", colour: "moss green" }),
    /under a hooded travelling cloak, in moss green/,
  );
  // And falls back to the outfit when there is no layer.
  assert.match(
    lookSentence({ outfit: "a plain dress with deep pockets", colour: "deep red" }),
    /wearing a plain dress with deep pockets, in deep red/,
  );
});

test("wardrobe: 'nothing at all' armour is not read out as armour", () => {
  const sentence = lookSentence({ armour: "nothing at all — speed is the plan" });
  assert.equal(sentence, "");
});

test("wardrobe: the whole thing reads as one sentence", () => {
  const sentence = lookSentence(
    {
      hair: "two braids, tied with ribbon",
      outfit: "travelling leathers, well worn in",
      layer: "a hooded travelling cloak",
      armour: "leather bracers, scuffed pale",
      colour: "moss green",
      signature: "a whistle on a cord",
    },
    "Mira",
  );

  assert.equal(
    sentence,
    "Mira, with two braids, tied with ribbon, wearing travelling leathers, well worn in, " +
      "under a hooded travelling cloak, in moss green, and leather bracers, scuffed pale, " +
      "and always a whistle on a cord.",
  );
});

// ---- Columns ----------------------------------------------------------------

test("wardrobe: every slot has a column and a catalogue", () => {
  for (const slot of SLOTS) {
    assert.equal(columnFor(slot), `look${slot[0].toUpperCase()}${slot.slice(1)}`);
    assert.ok(WARDROBE[slot].options.length >= 8, `${slot} needs a list worth browsing`);
  }
});

test("wardrobe: clearing a slot writes null rather than leaving it behind", () => {
  // The helmet has to actually come off. A partial write would leave it on
  // forever, which is the kind of bug a ten-year-old finds in one evening.
  const columns = lookColumns({ hair: "a cloud of curls" });
  assert.equal(columns.lookHair, "a cloud of curls");
  assert.equal(columns.lookArmour, null);
  assert.equal(Object.keys(columns).length, SLOTS.length);
});

test("wardrobe: a row reads back as the look it was written from", () => {
  const look = { hair: "a long braid down one shoulder", colour: "sky blue" };
  assert.deepEqual(lookOf(lookColumns(look)), look);
});

test("wardrobe: whitespace-only choices are not choices", () => {
  assert.deepEqual(lookOf({ lookHair: "   ", lookColour: "lilac" }), { colour: "lilac" });
});

// ---- Things she found -------------------------------------------------------

const titles = new Map([["c1", "The Barley Field"]]);

test("wardrobe: a cloak she found is offered as something to wear", () => {
  const earned = earnedWearables(
    [{ name: "a moth-eaten grey cloak", foundInCampaignId: "c1" }],
    titles,
  );
  assert.equal(earned.length, 1);
  assert.equal(earned[0].slot, "layer");
  assert.equal(earned[0].from, "from The Barley Field");
});

test("wardrobe: armour goes in the armour slot", () => {
  const earned = earnedWearables([{ name: "a battered helm", foundInCampaignId: "c1" }], titles);
  assert.equal(earned[0].slot, "armour");
});

test("wardrobe: a rope is not clothing", () => {
  assert.deepEqual(earnedWearables([{ name: "a coil of rope" }], titles), []);
});

test("wardrobe: an adventure that has been tidied up still leaves the cloak", () => {
  // The campaign is gone, the item is not, and losing the title must not lose
  // the fact that she earned it.
  const earned = earnedWearables([{ name: "a red cape", foundInCampaignId: "gone" }], titles);
  assert.equal(earned[0].from, "found on the way");
});

test("wardrobe: one item is offered once, not once per matching word", () => {
  const earned = earnedWearables([{ name: "a cloak-and-helm set" }], titles);
  assert.equal(earned.length, 1);
});

// ---- The ladder -------------------------------------------------------------

const base = { id: "ch1", name: "Mira", look: {}, portraitVersion: null, art: null };

test("ladder: a drawing beats everything", () => {
  const picture = characterPicture({
    ...base,
    portraitVersion: 3,
    art: { version: 9, lookKey: "x" },
  });
  assert.equal(picture.source, "DRAWN");
  assert.match(picture.source === "DRAWN" ? picture.url : "", /portrait\?v=3/);
});

test("ladder: a generated portrait is used when there is no drawing", () => {
  const picture = characterPicture({ ...base, art: { version: 2, lookKey: lookKey({}) } });
  assert.equal(picture.source, "GENERATED");
  assert.equal(picture.source === "GENERATED" ? picture.stale : true, false);
});

test("ladder: changing her clothes makes the portrait stale, not gone", () => {
  const picture = characterPicture({
    ...base,
    look: { colour: "moss green" },
    art: { version: 2, lookKey: lookKey({ colour: "deep red" }) },
  });
  assert.equal(picture.source, "GENERATED");
  assert.equal(picture.source === "GENERATED" ? picture.stale : false, true);
});

test("ladder: everybody always has a face", () => {
  const picture = characterPicture(base);
  assert.equal(picture.source, "CREST");
  assert.equal(picture.source === "CREST" ? picture.letter : "", "M");
});

test("ladder: the crest is drawn in the colour she chose", () => {
  const plain = characterPicture(base);
  const green = characterPicture({ ...base, look: { colour: "moss green" } });
  assert.notEqual(
    plain.source === "CREST" ? plain.ink : "",
    green.source === "CREST" ? green.ink : "",
  );
  assert.deepEqual(inkFor({ colour: "moss green" }), inkFor({ colour: "Moss Green" }));
});

test("ladder: a name starting with an accent gets a whole letter", () => {
  const picture = characterPicture({ ...base, name: "Émile" });
  assert.equal(picture.source === "CREST" ? picture.letter : "", "É");
});

// ---- What is asked for ------------------------------------------------------

test("portrait prompt: asks for one person and forbids inventing things", () => {
  const prompt = portraitPrompt({
    name: "Mira",
    race: "Human",
    archetype: "Trickster",
    ageBand: "CHILD",
    look: "with two braids, wearing travelling leathers.",
    tone: "COZY",
  });

  assert.match(prompt, /head-and-shoulders portrait of one person/);
  assert.match(prompt, /invent no extra clothing/);
  assert.match(prompt, /child Human Trickster/);
  assert.match(prompt, /two braids/);
});

test("portrait prompt: says nothing about her personality", () => {
  // "Will not be hurried" is not a drawable fact, and handing a drawing model a
  // sentence about behaviour is how a portrait acquires an expression nobody
  // chose. The only text that reaches it is the wardrobe.
  const prompt = portraitPrompt({
    name: "Mira",
    race: "Human",
    archetype: "Trickster",
    ageBand: "CHILD",
    look: "",
    tone: "SPOOKY",
  });
  assert.match(prompt, /Simple travelling clothes/);
  assert.doesNotMatch(prompt, /hurried|stubborn|behaves/i);
});
