import { strict as assert } from "node:assert";
import { test } from "node:test";
import { looksLikeTheSameThing, reconcileFinds } from "../lib/game/finds.ts";

test("finds: the storyteller's longer name for a thing still matches", () => {
  assert.ok(looksLikeTheSameThing("the brass key", "a small brass key, green at the teeth"));
});

test("finds: the shorter name matches too", () => {
  assert.ok(looksLikeTheSameThing("Great-Aunt Bramble's brass key", "brass key"));
});

test("finds: plurals do not hide a thing that was found", () => {
  assert.ok(looksLikeTheSameThing("the silver bells", "a silver bell"));
});

test("finds: a different object is not mistaken for the one asked for", () => {
  assert.ok(!looksLikeTheSameThing("the brass key", "a jar of honey"));
  assert.ok(!looksLikeTheSameThing("the lantern", "a lantern-fox feather"), "shares only a prefix");
});

test("finds: common words alone are not a match", () => {
  // Otherwise "the small old box" would match "the small old kettle".
  assert.ok(!looksLikeTheSameThing("the small old box", "the small old kettle"));
});

test("finds: capitals and punctuation are not the point", () => {
  assert.ok(looksLikeTheSameThing("The Brass Key!", "brass key"));
});

test("finds: what is still missing is reported with who has the rest", () => {
  const result = reconcileFinds(
    [
      { name: "the brass key", actIndex: 1, actTitle: "Rooms That Should Not Fit" },
      { name: "the unsent letter", actIndex: 2, actTitle: "What Bramble Left Undone" },
    ],
    [{ name: "a small brass key", holder: "Mira" }],
  );

  assert.equal(result[0].foundBy, "Mira");
  assert.equal(result[1].foundBy, null);
  assert.equal(result[1].actTitle, "What Bramble Left Undone");
});

test("finds: an adventure that asks for nothing reports nothing", () => {
  assert.deepEqual(reconcileFinds([], [{ name: "a jar of honey", holder: "Fen" }]), []);
});
