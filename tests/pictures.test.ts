import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pictureKey, sniffImage, MAX_PICTURE_BYTES } from "../lib/game/pictures.ts";

const bytes = (...values: number[]) => new Uint8Array(values);

// ---- What counts as a picture ----------------------------------------------

test("pictures: the format is read from the bytes, not the filename", () => {
  assert.equal(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d)), "image/png");
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0x00)), "image/webp");
});

test("pictures: something that is not a picture is refused", () => {
  // The whole reason for sniffing: a file claiming to be a PNG and not being
  // one would be served back to every player in the family with that claim
  // intact, and the browser would decide for itself what to do with it.
  assert.equal(sniffImage(bytes(0x3c, 0x73, 0x63, 0x72)), null, "accepted markup");
  assert.equal(sniffImage(bytes(0x25, 0x50, 0x44, 0x46)), null, "accepted a PDF");
  assert.equal(sniffImage(bytes()), null, "accepted nothing at all");
  assert.equal(sniffImage(bytes(0x89, 0x50)), null, "accepted a truncated header");
});

test("pictures: the cap leaves room for a shrunk photograph, not a raw one", () => {
  // The browser sends a 1024x576 JPEG at quality 0.85 — a few hundred kilobytes.
  // A raw phone photograph is four megabytes or more. The cap has to sit
  // comfortably between the two.
  assert.ok(MAX_PICTURE_BYTES > 1_000_000, "too tight for a wide drawing");
  assert.ok(MAX_PICTURE_BYTES < 4_000_000, "a raw phone photograph would fit");
});

// ---- Addressing a person or a place ----------------------------------------

test("pictures: the storyteller's three spellings land on one drawing", () => {
  // It will call the same character "the beekeeper", "The Beekeeper" and
  // "the beekeeper." across three turns. Three keys would mean a family draws
  // him and is then asked to draw him again.
  assert.equal(pictureKey("the beekeeper"), "beekeeper");
  assert.equal(pictureKey("The Beekeeper"), "beekeeper");
  assert.equal(pictureKey("the beekeeper."), "beekeeper");
  assert.equal(pictureKey("  The   Beekeeper  "), "beekeeper");
});

test("pictures: a leading article is dropped, but only a leading one", () => {
  assert.equal(pictureKey("A bridge troll"), "bridge troll");
  assert.equal(pictureKey("An old lighthouse keeper"), "old lighthouse keeper");
  // "The" inside the name is part of the name.
  assert.equal(pictureKey("Keeper of the Lights"), "keeper of the lights");
});

test("pictures: two different people do not collide", () => {
  assert.notEqual(pictureKey("the beekeeper"), pictureKey("the bridge troll"));
  assert.notEqual(pictureKey("Mira"), pictureKey("Mirabel"));
});

test("pictures: a name that is only punctuation gives nothing to key on", () => {
  // Guarded because an empty key would collide with every other empty key, and
  // one family's drawing would turn up under another's blank name.
  assert.equal(pictureKey("???"), "");
  assert.equal(pictureKey("   "), "");
});

test("pictures: names with numbers and accents survive", () => {
  assert.equal(pictureKey("Room 12"), "room 12");
  assert.equal(pictureKey("Père Guillaume"), "père guillaume");
});
