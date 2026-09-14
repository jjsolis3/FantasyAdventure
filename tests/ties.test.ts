import assert from "node:assert/strict";
import test from "node:test";
import { CONFIRMED_TIES, isConfirmed, needsConsent, pendingFor } from "../lib/game/ties.ts";
import { canonicalPair, reciprocalOf, RELATIONSHIP_KINDS } from "../lib/game/rules.ts";

// Who a tie may reach is no longer asked here — `reachableCharacterWhere` and
// the party picker's rule were two answers to one question, and they are now
// `visibleCharacterWhere`. Its shape is asserted in `tests/visibility.test.ts`.

// ---- Who has to agree -------------------------------------------------------

test("a tie inside one household needs nobody's permission", () => {
  // This is the assertion that changed, and it is a gift rather than a
  // restriction. It used to compare *account* ids — so on this very
  // installation, where a father and his two daughters each have their own
  // sign-in, "Mira is Bramble's sister" needed a nine-year-old to confirm her
  // own family's paperwork before the tie earned a single bond point.
  assert.equal(needsConsent("hh_solis", "hh_solis"), false);
});

test("a tie that reaches into another family does", () => {
  // The friend's family. A claim about somebody else's child earns real things
  // — bond levels, Family Moves — so it waits for their yes.
  assert.equal(needsConsent("hh_solis", "hh_friends"), true);
});

test("and an account belonging to no household is never taken as agreeing", () => {
  // Two nulls must not match. Not an ordinary state, but the answer to "may
  // this nobody speak for that nobody" has to be no rather than an accidental
  // yes from two blanks comparing equal.
  assert.equal(needsConsent(null, null), true);
  assert.equal(needsConsent("hh_solis", null), true);
  assert.equal(needsConsent(null, "hh_solis"), true);
  assert.equal(needsConsent(undefined, undefined), true);
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
