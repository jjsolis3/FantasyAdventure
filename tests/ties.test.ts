import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRMED_TIES,
  isConfirmed,
  needsConsent,
  pendingFor,
  reachableCharacterWhere,
} from "../lib/game/ties.ts";
import { canonicalPair, reciprocalOf, RELATIONSHIP_KINDS } from "../lib/game/rules.ts";

// ---- Who you can reach ------------------------------------------------------

test("reach covers your own adventurers and everybody at your table", () => {
  const where = reachableCharacterWhere("me");
  const branches = where.OR as Record<string, unknown>[];

  // Your own.
  assert.deepEqual(branches[0], { userId: "me" });

  // And anybody in an adventure you own or are travelling in — the same
  // definition `memberCampaignWhere` uses everywhere else, so the two cannot
  // drift into disagreeing about who is at your table.
  const table = JSON.stringify(branches[1]);
  assert.match(table, /partyMemberships/);
  assert.match(table, /ownerId/);
  assert.match(table, /party/);
});

test("reach is not keyed on the character doing the declaring", () => {
  // The bug this replaced: the old rule asked whether THIS character had
  // already shared a campaign, so a newly made adventurer could reach nobody —
  // which is exactly when a family wants to say who he is.
  const where = JSON.stringify(reachableCharacterWhere("me"));
  assert.doesNotMatch(where, /characterId/);
});

// ---- Who has to agree -------------------------------------------------------

test("a tie inside one household needs nobody's permission", () => {
  assert.equal(needsConsent("me", "me"), false);
});

test("a tie that touches another household does", () => {
  assert.equal(needsConsent("me", "my-daughter"), true);
});

test("a tie counts only once it has been agreed to", () => {
  assert.equal(isConfirmed({ confirmedAt: new Date() }), true);
  assert.equal(isConfirmed({ confirmedAt: null }), false);
});

test("the query filter asks for exactly that", () => {
  assert.deepEqual(CONFIRMED_TIES, { confirmedAt: { not: null } });
});

// ---- Who is waiting on whom -------------------------------------------------

test("nobody is waiting on a tie that has been agreed", () => {
  assert.equal(pendingFor({ confirmedAt: new Date(), proposedById: "dad" }, "dad"), null);
  assert.equal(pendingFor({ confirmedAt: new Date(), proposedById: "dad" }, "kid"), null);
});

test("the household that asked is waiting on the other one", () => {
  assert.equal(pendingFor({ confirmedAt: null, proposedById: "dad" }, "dad"), "them");
});

test("and the household that was asked is the one holding it up", () => {
  assert.equal(pendingFor({ confirmedAt: null, proposedById: "dad" }, "kid"), "you");
});

// ---- The tie itself ---------------------------------------------------------

test("a friendship is a tie like any other, and always has been", () => {
  // Asked directly because it came up as a question: BFF and friends did not
  // need adding, they needed somebody to be reachable to apply them to.
  assert.ok(RELATIONSHIP_KINDS.includes("FRIEND"));
  assert.equal(reciprocalOf("FRIEND"), "FRIEND");
});

test("declaring a tie from either end stores the same row", () => {
  // The pair is canonical, so "Orin is the parent of Wren" and "Wren is the
  // child of Orin" cannot become two rows with two separate bond counters.
  const fromDad = canonicalPair("orin", "wren", "PARENT");
  const fromKid = canonicalPair("wren", "orin", "CHILD");
  assert.deepEqual(fromDad, fromKid);
});
