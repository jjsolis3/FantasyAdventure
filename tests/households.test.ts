import assert from "node:assert/strict";
import test from "node:test";
import { householdNameFor, mayActForHousehold } from "../lib/game/households.ts";

// ---- What a household gets called ------------------------------------------

test("a household is named after the person it was made for", () => {
  assert.equal(householdNameFor("Dad"), "Dad's household");
});

test("and a name already ending in s does not get a second one", () => {
  // "Chris's household" is defensible and "Jess's household" is worse; both
  // read as a typo on a screen a child looks at every week. The apostrophe
  // alone is the older convention and the one that never looks like a mistake.
  assert.equal(householdNameFor("Jess"), "Jess' household");
});

test("whitespace is not a name", () => {
  // The display name is trimmed on the way into the database, but this is
  // called from the migration path too, where nothing has trimmed anything.
  assert.equal(householdNameFor("   "), "A household");
  assert.equal(householdNameFor("  Ada  "), "Ada's household");
});

// ---- Who may act for one ---------------------------------------------------

test("the people who answer for a household may act for it", () => {
  assert.equal(mayActForHousehold("OWNER"), true);
  assert.equal(mayActForHousehold("PARENT"), true);
});

test("and the people who only play may not", () => {
  // The child accounts. They hold characters and take turns; they do not hand
  // out invitations or attach the family to another one.
  assert.equal(mayActForHousehold("MEMBER"), false);
});

test("an account with no household at all may not act for one", () => {
  // Not an ordinary state — registration makes a household in the same
  // transaction as the account — but the answer to "may this nobody do
  // something" has to be no rather than a crash.
  assert.equal(mayActForHousehold(null), false);
  assert.equal(mayActForHousehold(undefined), false);
  assert.equal(mayActForHousehold("SOMETHING_ELSE"), false);
});
