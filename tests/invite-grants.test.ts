import assert from "node:assert/strict";
import test from "node:test";
import { planInvite } from "../lib/auth/invites.ts";

/**
 * What an invitation is allowed to grant.
 *
 * A code used to mean one thing — "you may create an account" — and what that
 * account became was decided by counting the users table. This is the rule that
 * replaced it, and the reason it is a function rather than four lines inside a
 * server action: the refusals are the interesting part, and a refusal you can
 * only reach through a browser session is a refusal that stops being tested.
 */

const operator = { householdId: "hh_solis", everywhere: true };
const parent = { householdId: "hh_solis", everywhere: false };

// ---- Admitting a family ----------------------------------------------------

test("whoever runs Hearthlight may admit a new family", () => {
  const plan = planInvite({ actor: operator, grant: "NEW_HOUSEHOLD", intendedRole: null });
  assert.equal(plan.ok, true);
});

test("and a parent may not, however the form was posted", () => {
  // The rule the whole stage exists for. A parent invites their own children
  // and nobody else's; admitting another family to the installation is not
  // something one family does to another.
  const plan = planInvite({ actor: parent, grant: "NEW_HOUSEHOLD", intendedRole: null });
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.reason, /runs Hearthlight/);
});

test("a code that admits a family points at no household, because it makes one", () => {
  const plan = planInvite({ actor: operator, grant: "NEW_HOUSEHOLD", intendedRole: null });
  assert.equal(plan.ok && plan.householdId, null);
});

test("and carries no role, because its redeemer becomes the owner", () => {
  // Said once, by `createHousehold`, at the moment the household comes into
  // existence. A role on the invitation would be a second place for the same
  // fact — and the one that could disagree.
  const plan = planInvite({ actor: operator, grant: "NEW_HOUSEHOLD", intendedRole: "PARENT" });
  assert.equal(plan.ok && plan.intendedRole, null);
});

// ---- Inviting into your own house ------------------------------------------

test("a member invitation is stamped with the caller's own household", () => {
  const plan = planInvite({ actor: parent, grant: "HOUSEHOLD_MEMBER", intendedRole: "MEMBER" });
  assert.equal(plan.ok && plan.householdId, "hh_solis");
});

test("and there is no way to address one at somebody else's", () => {
  // Not "the form field is ignored" — there is no field. The household comes
  // off the session or not at all, so both parents' codes land in their own
  // house and a hand-posted request has nothing to aim.
  const smith = { householdId: "hh_smith", everywhere: false };
  const plan = planInvite({ actor: smith, grant: "HOUSEHOLD_MEMBER", intendedRole: "MEMBER" });
  assert.equal(plan.ok && plan.householdId, "hh_smith");
});

test("whoever runs Hearthlight invites into their own house like anybody else", () => {
  // Running the installation and being a parent are two different jobs that
  // happen to be one login here. This one is the parent job.
  const plan = planInvite({ actor: operator, grant: "HOUSEHOLD_MEMBER", intendedRole: "MEMBER" });
  assert.equal(plan.ok && plan.householdId, "hh_solis");
});

test("an unstated role means they play", () => {
  // A child's account must not arrive able to invite strangers into the house
  // because a field was left blank.
  const plan = planInvite({ actor: parent, grant: "HOUSEHOLD_MEMBER", intendedRole: null });
  assert.equal(plan.ok && plan.intendedRole, "MEMBER");
});

test("a second grown-up can be invited as one", () => {
  const plan = planInvite({ actor: parent, grant: "HOUSEHOLD_MEMBER", intendedRole: "PARENT" });
  assert.equal(plan.ok && plan.intendedRole, "PARENT");
});

// ---- Nobody at all ---------------------------------------------------------

test("an account in no household cannot invite anybody into it", () => {
  // Not an ordinary state — registration makes a household in the same
  // transaction as the account — but the answer has to be a refusal rather than
  // a code with a null household, which would quietly start a second family.
  const stray = { householdId: null, everywhere: false };
  const plan = planInvite({ actor: stray, grant: "HOUSEHOLD_MEMBER", intendedRole: null });
  assert.equal(plan.ok, false);
});

// ---- Inviting into somebody else's house -----------------------------------

test("whoever runs Hearthlight may aim an invitation at a named family", () => {
  // The gap this rule had. A family whose only grown-up has forgotten their
  // password, or who needs a second parent adding and cannot manage it between
  // them, has to be reachable by somebody — and the alternative was writing a
  // row into the database by hand, which is not a remedy, it is an outage with
  // a workaround.
  const plan = planInvite({
    actor: operator,
    grant: "HOUSEHOLD_MEMBER",
    intendedRole: "PARENT",
    targetHouseholdId: "hh_okonkwo",
  });
  assert.equal(plan.ok && plan.householdId, "hh_okonkwo");
});

test("and a parent who aims one is refused rather than quietly redirected", () => {
  // Silently stamping their own household would be safe and dishonest. A
  // request that pointed somewhere it may not go deserves to be told so — and a
  // refusal is a thing a test can see, where a quiet substitution looks exactly
  // like the ordinary path.
  const plan = planInvite({
    actor: parent,
    grant: "HOUSEHOLD_MEMBER",
    intendedRole: "MEMBER",
    targetHouseholdId: "hh_okonkwo",
  });
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.reason, /only invite people into your own household/);
});

test("a blank target is not a target", () => {
  // Forms post empty strings. One must not read as "aim this somewhere", or
  // every ordinary invitation from an administrator would take the other path.
  const plan = planInvite({
    actor: parent,
    grant: "HOUSEHOLD_MEMBER",
    intendedRole: "MEMBER",
    targetHouseholdId: "   ",
  });
  assert.equal(plan.ok && plan.householdId, "hh_solis");
});

test("an administrator in no household of their own can still help one", () => {
  // Registration makes a household in the same transaction as the account, so
  // this is not an ordinary state — but an installation whose operator does not
  // play should not thereby lose the ability to fix anybody's family.
  const nomad = { householdId: null, everywhere: true };
  const plan = planInvite({
    actor: nomad,
    grant: "HOUSEHOLD_MEMBER",
    intendedRole: "PARENT",
    targetHouseholdId: "hh_okonkwo",
  });
  assert.equal(plan.ok && plan.householdId, "hh_okonkwo");
});
