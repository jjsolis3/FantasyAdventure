import { strict as assert } from "node:assert";
import { test } from "node:test";
import { capitalise, isPlural, pronounsOf, toBe, toHave } from "../lib/game/pronouns.ts";

test("pronouns: the three the builder offers are read correctly", () => {
  assert.deepEqual(pronounsOf("she/her"), {
    subject: "she",
    object: "her",
    possessive: "her",
  });
  assert.deepEqual(pronounsOf("he/him"), { subject: "he", object: "him", possessive: "his" });
  assert.deepEqual(pronounsOf("they/them"), {
    subject: "they",
    object: "them",
    possessive: "their",
  });
});

test("pronouns: the field is free text, so it is read forgivingly", () => {
  assert.equal(pronounsOf("  He / Him  ").subject, "he");
  assert.equal(pronounsOf("HE/HIM").possessive, "his");
});

test("pronouns: something unfamiliar is used rather than overridden", () => {
  // A player who types xe/xem meant it. Guessing at a possessive is worse than
  // borrowing the object form, which at least reads as intended.
  const xe = pronounsOf("xe/xem");
  assert.equal(xe.subject, "xe");
  assert.equal(xe.object, "xem");
});

test("pronouns: an empty field falls back to they, never to a guess", () => {
  // The one default that is never a misgendering — and right for a character
  // who might be a dragon, a lantern or a goat.
  for (const value of ["", "   ", null, undefined]) {
    assert.deepEqual(pronounsOf(value), {
      subject: "they",
      object: "them",
      possessive: "their",
    });
  }
});

test("pronouns: a single word still works", () => {
  const it = pronounsOf("it");
  assert.equal(it.subject, "it");
  assert.equal(it.object, "it");
  assert.equal(it.possessive, "its");
});

test("pronouns: the verb agrees, so a heading is not machine-made", () => {
  // "they is like" is exactly the sort of thing that gives it away.
  assert.equal(toBe("she"), "is");
  assert.equal(toBe("he"), "is");
  assert.equal(toBe("they"), "are");

  assert.equal(toHave("she"), "has");
  assert.equal(toHave("they"), "have");

  assert.equal(isPlural("they"), true);
  assert.equal(isPlural("she"), false);
});

test("pronouns: a heading can start with one", () => {
  assert.equal(capitalise("she"), "She");
  assert.equal(capitalise("they"), "They");
  assert.equal(capitalise(""), "");
});
