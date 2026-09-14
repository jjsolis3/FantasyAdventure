import assert from "node:assert/strict";
import test from "node:test";
import { householdNameFor, mayActForHousehold, mayTouch } from "../lib/game/households.ts";

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

// ---- Whose adventurer it is ------------------------------------------------
//
// The rule that was missing. `resetCharacterAction` took an adventurer's id
// from a form and never compared it to anything the caller owned, so any
// administrator could send any adventurer in the installation back to level
// one — every skill, knack and keepsake with it. Harmless while one family
// played and one person was the administrator, and a way to wipe a stranger's
// child's evening the moment there are two.

const parent = { householdId: "hh_solis", everywhere: false };
const operator = { householdId: "hh_solis", everywhere: true };

test("touch: a parent may act on their own family's things", () => {
  assert.equal(mayTouch(parent, "hh_solis"), true);
});

test("touch: and not on another family's", () => {
  assert.equal(mayTouch(parent, "hh_smith"), false);
});

test("touch: whoever runs the installation may act on anybody's", () => {
  // Somebody has to be able to help a family who cannot help themselves — and
  // their own household is one of the ones they would otherwise be shut out of.
  assert.equal(mayTouch(operator, "hh_smith"), true);
  assert.equal(mayTouch(operator, "hh_solis"), true);
});

test("touch: an account belonging to no household may act on nothing", () => {
  // Not an ordinary state: registering makes a household in the same
  // transaction as the account. So the answer to "may this nobody touch that"
  // is no, rather than a crash or an accidental yes from two nulls matching.
  const stray = { householdId: null, everywhere: false };
  assert.equal(mayTouch(stray, "hh_solis"), false);
  assert.equal(mayTouch(stray, null), false);
});

test("touch: and nothing belonging to no household may be acted on", () => {
  assert.equal(mayTouch(parent, null), false);
  assert.equal(mayTouch(parent, undefined), false);
});
