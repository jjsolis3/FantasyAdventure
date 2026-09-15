import assert from "node:assert/strict";
import test from "node:test";
import { mayEditStoryline, visibleStorylineWhere } from "../lib/game/visibility.ts";

/**
 * Who an adventure is for, and who may take it apart.
 *
 * `Storyline` had no household at all. Every adventure written in the app was
 * installation-wide and only whoever ran the server could write one — which was
 * right while one family played, and is the same leak households exist to close
 * the moment two do: a family's homemade story about their own house, with
 * their own cat in it, appearing in every other family's setup list.
 *
 * The `where` clause is asserted by shape rather than by running it, in the
 * idiom `tests/ties.test.ts` established: the module cannot be decoupled from
 * Prisma's types, and what matters here is which branches exist.
 */

const solis = "hh_solis";
const okonkwo = "hh_okonkwo";

function branches(householdId: string | null) {
  return visibleStorylineWhere(householdId).OR as { scope: string; householdId?: string }[];
}

// ---- What a family is offered ----------------------------------------------

test("everybody gets the adventures that ship with the game", () => {
  assert.ok(branches(solis).some((branch) => branch.scope === "SYSTEM"));
  assert.ok(branches(null).some((branch) => branch.scope === "SYSTEM"));
});

test("and the ones deliberately shared with every family", () => {
  assert.ok(branches(solis).some((branch) => branch.scope === "COMMUNITY"));
});

test("a family gets its own, named", () => {
  const own = branches(solis).find((branch) => branch.scope === "HOUSEHOLD");
  assert.equal(own?.householdId, solis);
});

test("and there is no branch that would reach another family's", () => {
  // The whole point. Three branches, and the only one mentioning a household
  // mentions this one.
  const mentioned = branches(solis)
    .map((branch) => branch.householdId)
    .filter(Boolean);
  assert.deepEqual(mentioned, [solis]);
});

test("a signed-out visitor gets the shipped ones and nothing else", () => {
  // Not `householdId: null`, which would match every *ownerless* row — and
  // after a household is deleted, that is precisely the set of adventures
  // nobody should be offered. The branch has to be absent, not null.
  const scopes = branches(null).map((branch) => branch.scope);
  assert.deepEqual(scopes, ["SYSTEM", "COMMUNITY"]);
});

test("a linked family's adventures are deliberately not included", () => {
  // The one place this disagrees with `visibleCharacterWhere`, which does follow
  // links. Linking two households means "our children play together"; it does
  // not mean "you may run my adventure". A half-written story about your own
  // street with the neighbours in it is not something to hand over because the
  // children are friends — COMMUNITY is the single click that says otherwise.
  //
  // This is asserted by arity: the rule takes one household, not a list, so
  // there is nowhere for a linked one to arrive even by mistake.
  assert.equal(visibleStorylineWhere.length, 1);
  assert.equal(branches(solis).length, 3);
});

// ---- Who may edit one ------------------------------------------------------

const parent = { householdId: solis, everywhere: false };
const operator = { householdId: solis, everywhere: true };

test("a family may edit its own", () => {
  assert.equal(mayEditStoryline(parent, { scope: "HOUSEHOLD", householdId: solis }), true);
});

test("and may not edit another family's", () => {
  assert.equal(mayEditStoryline(parent, { scope: "HOUSEHOLD", householdId: okonkwo }), false);
});

test("nor one that came with the game, however many families read it", () => {
  // Editing a shipped adventure must not quietly take it away from everybody
  // else on the installation.
  assert.equal(mayEditStoryline(parent, { scope: "SYSTEM", householdId: null }), false);
});

test("a family may still edit its own after it has been shared", () => {
  // Sharing changed who else can read it, not who it belongs to.
  assert.equal(mayEditStoryline(parent, { scope: "COMMUNITY", householdId: solis }), true);
});

test("but not somebody else's shared one", () => {
  assert.equal(mayEditStoryline(parent, { scope: "COMMUNITY", householdId: okonkwo }), false);
});

test("whoever runs the installation may put anything right", () => {
  // Somebody has to be able to help a family who cannot help themselves, and
  // the alternative is a support request that can only be answered with SQL.
  assert.equal(mayEditStoryline(operator, { scope: "HOUSEHOLD", householdId: okonkwo }), true);
  assert.equal(mayEditStoryline(operator, { scope: "SYSTEM", householdId: null }), true);
});

test("an ownerless adventure belongs to nobody, not to everybody", () => {
  // What a household-scoped row looks like after its family has been deleted:
  // SET NULL rather than cascade, so the journals that were written about it
  // still read. Nobody inherits the right to edit it.
  const stray = { scope: "HOUSEHOLD", householdId: null };
  assert.equal(mayEditStoryline(parent, stray), false);
  assert.equal(mayEditStoryline({ householdId: null, everywhere: false }, stray), false);
});
