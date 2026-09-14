import assert from "node:assert/strict";
import test from "node:test";
import { mayChangePlatformRole } from "../lib/auth/platform-admin.ts";

/**
 * Handing the installation to somebody else.
 *
 * Until this rule existed there was no way to move `User.role` at all.
 * `PLATFORM_ADMIN_EMAIL` is read once, at registration, by `shouldAdminister` —
 * so changing it on a running server does nothing to the accounts already on
 * it, and the only remedy was an `UPDATE` typed into a database console. That is
 * a workable answer for exactly one person and no answer for anybody else.
 */

const operator = { id: "u_one", platformAdmin: true };
const parent = { id: "u_two", platformAdmin: false };

function target(over: Partial<Parameters<typeof mayChangePlatformRole>[0]["target"]> = {}) {
  return {
    id: "u_three",
    platformAdmin: false,
    hasEmail: true,
    displayName: "Wrenna",
    ...over,
  };
}

// ---- Who may hand it on ----------------------------------------------------

test("an administrator may hand the installation to somebody else", () => {
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: target(),
    makeAdmin: true,
    otherAdmins: 1,
  });
  assert.equal(verdict.ok, true);
});

test("a parent may not, whatever they post", () => {
  // The screen is administrator-only, which is not the same as the rule being
  // administrator-only. This is the rule.
  const verdict = mayChangePlatformRole({
    actor: parent,
    target: target(),
    makeAdmin: true,
    otherAdmins: 1,
  });
  assert.equal(verdict.ok, false);
});

// ---- Never your own --------------------------------------------------------

test("an administrator cannot change their own", () => {
  // Not caution — a shape. The hand-over is always performed by the account
  // *receiving* it: promote the new one, sign in as it, retire the old one from
  // there. That proves the new sign-in works while the old one can still fix
  // it, which is the one thing a database `UPDATE` could never do.
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: { ...target(), id: operator.id, platformAdmin: true },
    makeAdmin: false,
    otherAdmins: 5,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /sign in as that one/);
});

// ---- Never the last --------------------------------------------------------

test("the only administrator cannot be retired", () => {
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: target({ platformAdmin: true }),
    makeAdmin: false,
    otherAdmins: 0,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /only administrator/);
});

test("but one of two can be", () => {
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: target({ platformAdmin: true }),
    makeAdmin: false,
    otherAdmins: 1,
  });
  assert.equal(verdict.ok, true);
});

// ---- Who may be given it ---------------------------------------------------

test("an account that signs in with a username may not be given the installation", () => {
  // Those are children's accounts — that is the entire reason the column
  // exists — and the storyteller's API keys are not a thing to put one
  // keystroke away from a nine-year-old. It also keeps this agreeing with
  // `shouldAdminister`, which has always required an address.
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: target({ hasEmail: false }),
    makeAdmin: true,
    otherAdmins: 1,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /username rather than an email/);
});

// ---- Nothing to do ---------------------------------------------------------

test("promoting somebody who already administers changes nothing, and says so", () => {
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: target({ platformAdmin: true }),
    makeAdmin: true,
    otherAdmins: 1,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /already does/);
});

test("and retiring somebody who does not administer likewise", () => {
  const verdict = mayChangePlatformRole({
    actor: operator,
    target: target(),
    makeAdmin: false,
    otherAdmins: 1,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /already does not/);
});
