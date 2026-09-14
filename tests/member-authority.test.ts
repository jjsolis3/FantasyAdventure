import assert from "node:assert/strict";
import test from "node:test";
import {
  mayEditSignIn,
  mayResetPassword,
  maySetRole,
  mayUseUsername,
} from "../lib/auth/member-authority.ts";

/**
 * Who may set somebody else's password.
 *
 * The hole this closes: a password was set at registration and changed only on
 * a screen that asks for the current one. A nine-year-old who forgot hers was
 * locked out for good, and neither her parent nor whoever runs the installation
 * could do anything — she has no email address to send a reset to, which is the
 * whole point of her having a username.
 *
 * The refusals are the interesting half, which is why this is a function rather
 * than a stack of conditions inside a server action.
 */

const HOME = "hh_solis";
const OTHER = "hh_friends";

const owner = { userId: "u_dad", householdId: HOME, householdRole: "OWNER", platformAdmin: false };
const parent = { userId: "u_mum", householdId: HOME, householdRole: "PARENT", platformAdmin: false };
const child = { userId: "u_mira", householdId: HOME, householdRole: "MEMBER", platformAdmin: false };
const operator = { userId: "u_ops", householdId: HOME, householdRole: "OWNER", platformAdmin: true };

// ---- Helping a child back in ------------------------------------------------

test("the owner may set a child's password", () => {
  assert.equal(mayResetPassword(owner, child).ok, true);
});

test("and so may the other grown-up in the house", () => {
  assert.equal(mayResetPassword(parent, child).ok, true);
});

test("whoever runs Hearthlight may help any family", () => {
  // Somebody has to be able to help a household that cannot help itself — the
  // friend's family, once there is one.
  const theirChild = { ...child, householdId: OTHER };
  assert.equal(mayResetPassword(operator, theirChild).ok, true);
});

// ---- Authority runs downwards, never sideways or up -------------------------

test("a parent may not reset the owner's password", () => {
  // Otherwise "promote the eldest so she can help" quietly becomes "the eldest
  // can take the household from you".
  const verdict = mayResetPassword(parent, owner);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /answers for this family/);
});

test("nor another parent's", () => {
  const second = { ...parent, userId: "u_aunt" };
  assert.equal(mayResetPassword(parent, second).ok, false);
});

test("but the owner may reset a parent's", () => {
  assert.equal(mayResetPassword(owner, parent).ok, true);
});

test("somebody who only plays may reset nobody", () => {
  assert.equal(mayResetPassword(child, { ...child, userId: "u_bea" }).ok, false);
});

// ---- Across the boundary ----------------------------------------------------

test("one family's owner cannot reach another family's child", () => {
  // The whole point of the households: a friend's family is not yours to
  // administer, however much authority you have in your own.
  assert.equal(mayResetPassword(owner, { ...child, householdId: OTHER }).ok, false);
});

test("nor somebody in no household at all", () => {
  assert.equal(mayResetPassword(owner, { ...child, householdId: null }).ok, false);
});

test("and an actor in no household reaches nobody", () => {
  const stray = { ...owner, householdId: null };
  assert.equal(mayResetPassword(stray, child).ok, false);
});

// ---- The installation's own account -----------------------------------------

test("a household owner cannot reset the platform administrator", () => {
  // Even living in their house. Being the owner of the household somebody
  // happens to be in is not a route to the storyteller's API key.
  const adminInMyHouse = { ...operator, userId: "u_ops" };
  assert.equal(mayResetPassword(owner, adminInMyHouse).ok, false);
});

test("and one administrator cannot reset another", () => {
  // So two operators cannot lock each other out of the installation.
  const second = { ...operator, userId: "u_ops2" };
  const verdict = mayResetPassword(operator, second);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /another's password/);
});

// ---- Yourself ---------------------------------------------------------------

test("nobody resets themselves here, and is told where to go", () => {
  // Knowing your own password means the profile screen, which asks for it. This
  // one is for the person who has forgotten.
  const verdict = mayResetPassword(owner, { ...owner });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /profile/);
});

test("not even the administrator", () => {
  assert.equal(mayResetPassword(operator, { ...operator }).ok, false);
});

// ---- Changing what somebody may do ------------------------------------------
//
// This was the platform administrator's job until the two roles ended up on
// different accounts and the cost showed: promoting your own spouse meant
// signing out and in as whoever runs the server. A household is the unit a
// family is administered in, so its owner administers it.

test("the owner may promote somebody who plays", () => {
  assert.equal(maySetRole(owner, child, "PARENT").ok, true);
});

test("and demote somebody who helps run it", () => {
  assert.equal(maySetRole(owner, parent, "MEMBER").ok, true);
});

test("a parent may not hand out their own job", () => {
  // The whole escalation guard. If a parent could grant PARENT, "promote the
  // eldest so she can help" would become a way around every rule that tells the
  // two apart — including who may reset whose password.
  const verdict = maySetRole(parent, child, "PARENT");
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /answers for this family/);
});

test("and nobody changes their own", () => {
  // An owner who demotes themselves leaves a family unable to invite, reset a
  // password or put a sheet right — and the person who could undo it is the one
  // who just gave the power away.
  const verdict = maySetRole(owner, { ...owner }, "MEMBER");
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /your own role/);
});

test("OWNER is not a role a family can hand out", () => {
  // Handing a household to a different owner is a transfer rather than an edit,
  // and it stays with the operator, where an accident is recoverable.
  assert.equal(maySetRole(owner, parent, "OWNER").ok, false);
  assert.equal(maySetRole(owner, child, "nonsense").ok, false);
});

test("not across households, and not on the administrator", () => {
  assert.equal(maySetRole(owner, { ...child, householdId: OTHER }, "PARENT").ok, false);
  assert.equal(maySetRole(owner, { ...operator, userId: "u_ops" }, "MEMBER").ok, false);
});

test("whoever runs Hearthlight may still set roles anywhere", () => {
  assert.equal(maySetRole(operator, { ...child, householdId: OTHER }, "PARENT").ok, true);
});

// ---- Who may hold a username ------------------------------------------------

test("somebody who only plays may sign in with a username", () => {
  assert.equal(mayUseUsername({ householdRole: "MEMBER", platformAdmin: false }), true);
});

test("and the grown-ups may not, because a reset has to reach them", () => {
  assert.equal(mayUseUsername({ householdRole: "OWNER", platformAdmin: false }), false);
  assert.equal(mayUseUsername({ householdRole: "PARENT", platformAdmin: false }), false);
});

test("nor whoever runs the installation, whatever their household role", () => {
  assert.equal(mayUseUsername({ householdRole: "MEMBER", platformAdmin: true }), false);
});

test("nor somebody in no household at all", () => {
  assert.equal(mayUseUsername({ householdRole: null, platformAdmin: false }), false);
});

// ---- Changing how somebody signs in -----------------------------------------

test("editing a sign-in asks exactly what resetting a password asks", () => {
  // Deliberately the same rule rather than a similar one: being able to set
  // somebody's password and being able to change the address that password
  // protects are the same amount of power over an account, and two rules that
  // meant to agree would eventually stop agreeing.
  for (const [actor, target] of [
    [owner, child],
    [parent, child],
    [parent, owner],
    [child, parent],
    [owner, { ...child, householdId: OTHER }],
    [owner, { ...owner }],
  ] as const) {
    assert.equal(mayEditSignIn(actor, target).ok, mayResetPassword(actor, target).ok);
  }
});
