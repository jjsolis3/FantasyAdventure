import assert from "node:assert/strict";
import test from "node:test";
import { areLinked, canonicalLink, visibleCharacterWhere } from "../lib/game/visibility.ts";

/**
 * Who you can see.
 *
 * The rule that used to have two answers. `invitableCharacters` asked for
 * `{ userId: { not: userId } }` — every character in the database, offered in a
 * dropdown with the name of the adult who plays them — while ties asked a
 * narrower question scoped to your own table. One question, two rules, and they
 * drifted exactly as far apart as you would expect.
 *
 * The clause itself is asserted by shape rather than by running it, the way
 * `tests/ties.test.ts` used to: it is a `where` object handed to Prisma, and a
 * unit test that needed a database to check it would not be a unit test.
 */

// ---- One pair, one row ------------------------------------------------------

test("a link between two households is stored the same way round either way", () => {
  // Without this the unique constraint is decorative: (A,B) and (B,A) would
  // both insert, and every read would have to look in two directions forever.
  assert.deepEqual(canonicalLink("hh_a", "hh_b"), canonicalLink("hh_b", "hh_a"));
});

test("and the smaller id leads, so the order is a fact rather than a coincidence", () => {
  assert.deepEqual(canonicalLink("hh_b", "hh_a"), { householdAId: "hh_a", householdBId: "hh_b" });
});

// ---- What you can see -------------------------------------------------------

test("you see your own household and the ones it plays with", () => {
  const where = visibleCharacterWhere("me", ["hh_mine", "hh_friends"]);
  const branches = where.OR as Record<string, unknown>[];
  assert.deepEqual(branches[0], { householdId: { in: ["hh_mine", "hh_friends"] } });
});

test("and anybody you are actually travelling with, link or no link", () => {
  // This branch is why unlinking does not break an adventure under way. Party
  // membership flows through `memberCampaignWhere`, which never mentions
  // households at all — so cutting the link empties the pickers and leaves a
  // half-played Saturday exactly where it was.
  const table = JSON.stringify((visibleCharacterWhere("me", ["hh_mine"]).OR as unknown[])[1]);
  assert.match(table, /partyMemberships/);
  assert.match(table, /ownerId/);
  assert.match(table, /party/);
});

test("it is not keyed on the character doing the looking", () => {
  // The older bug, still worth nailing down: a rule keyed on what THIS
  // character had already shared returned nobody for an adventurer made five
  // minutes ago, which is exactly when a family wants to say who he is.
  assert.doesNotMatch(JSON.stringify(visibleCharacterWhere("me", ["hh_mine"])), /characterId/);
});

test("an account in no household sees only the people it is travelling with", () => {
  // `visibleHouseholdIds` returns [] for a stray account, and Prisma reads
  // `{ in: [] }` as matching nothing. The safe direction: no adventurers rather
  // than all of them.
  const where = visibleCharacterWhere("me", []);
  const branches = where.OR as Record<string, unknown>[];
  assert.deepEqual(branches[0], { householdId: { in: [] } });
});

// ---- Yes or no, for the places that need one --------------------------------

test("two families that have agreed are linked", () => {
  assert.equal(areLinked(["hh_mine", "hh_friends"], "hh_friends"), true);
});

test("two that have not are not", () => {
  assert.equal(areLinked(["hh_mine"], "hh_strangers"), false);
});

test("your own household counts, because you adventure with yourself", () => {
  assert.equal(areLinked(["hh_mine"], "hh_mine"), true);
});

test("and nothing is linked to nothing", () => {
  // An adventure with no household is not a thing the schema permits —
  // `Campaign.householdId` is NOT NULL — but a join code typed against a row
  // read before that column existed must refuse rather than wave somebody in.
  assert.equal(areLinked(["hh_mine"], null), false);
  assert.equal(areLinked(["hh_mine"], undefined), false);
  assert.equal(areLinked([], null), false);
});
