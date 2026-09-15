import assert from "node:assert/strict";
import test from "node:test";
import { WHAT_GOES, WHAT_STAYS, mayCloseHousehold } from "../lib/game/close-household.ts";

/**
 * Who may end a family, and what they have to type.
 *
 * The most destructive thing in the application, so its refusals are a plain
 * function — a rule that can only be reached by actually deleting a family in a
 * browser is a rule nobody tests twice.
 */

const owner = { householdRole: "OWNER", everywhere: false };
const parent = { householdRole: "PARENT", everywhere: false };
const operator = { householdRole: "OWNER", everywhere: true };

const NAME = "The Solis family";

// ---- Who --------------------------------------------------------------------

test("whoever answers for the family may close it", () => {
  assert.equal(mayCloseHousehold({ actor: owner, householdName: NAME, typed: NAME }).ok, true);
});

test("a parent who does not answer for it may not", () => {
  // A PARENT may invite, reset a child's password and put a sheet right. None
  // of those is irreversible the way this is.
  const verdict = mayCloseHousehold({ actor: parent, householdName: NAME, typed: NAME });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /answers for this family/);
});

test("and running the installation makes somebody *less* able to, not more", () => {
  // The one place `everywhere` takes a power away, deliberately. An operator
  // supporting a family should not find a working button on their screen that
  // ends the family — they can already do more from /admin, where it is their
  // own decision rather than one made while looking at somebody else's page.
  const verdict = mayCloseHousehold({ actor: operator, householdName: NAME, typed: NAME });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /run this installation/);
});

// ---- What they type ---------------------------------------------------------

test("the name has to be typed out", () => {
  const verdict = mayCloseHousehold({ actor: owner, householdName: NAME, typed: "" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /The Solis family/);
});

test("another family's name will not do", () => {
  // The failure this actually guards against: not somebody who did not mean
  // it, but somebody with two tabs open who meant it about the other one.
  const verdict = mayCloseHousehold({
    actor: owner,
    householdName: NAME,
    typed: "The Okonkwo family",
  });
  assert.equal(verdict.ok, false);
});

test("capitals and stray spaces are forgiven", () => {
  // Somebody who has typed the name has read the name. Insisting they also
  // match its capitals is a puzzle rather than a safeguard.
  assert.equal(
    mayCloseHousehold({ actor: owner, householdName: NAME, typed: "  the solis FAMILY " }).ok,
    true,
  );
});

test("but a near miss is not", () => {
  // The control for the test above: forgiving case must not shade into
  // forgiving the name.
  assert.equal(
    mayCloseHousehold({ actor: owner, householdName: NAME, typed: "the solis famly" }).ok,
    false,
  );
});

// ---- What the screen promises -----------------------------------------------

test("the screen's list of consequences is not empty", () => {
  // These are read out to somebody about to do something irreversible, and
  // they live beside the rule so the two cannot drift. An empty list would
  // render a confirmation screen that confirms nothing.
  assert.ok(WHAT_GOES.length >= 4);
  assert.ok(WHAT_STAYS.length >= 1);
});

test("and it says the children's sign-ins go too", () => {
  // The single most surprising consequence, and the one most worth being told
  // before rather than after.
  assert.ok(WHAT_GOES.some((line) => /sign-in/.test(line)));
});

test("and that another family's adventure is not theirs to end", () => {
  assert.ok(WHAT_STAYS.some((line) => /another family/.test(line)));
});
