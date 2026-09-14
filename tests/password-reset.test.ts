import assert from "node:assert/strict";
import test from "node:test";
import {
  RESET_MESSAGES,
  RESET_WINDOW_MINUTES,
  hashResetToken,
  makeResetToken,
  resetLink,
  resetState,
} from "../lib/auth/password-reset.ts";

/**
 * Reset links, for the half of the accounts that have somewhere to send to.
 *
 * A child signs in with a username and holds no address, so she is never
 * emailed; her parent sets her password directly. This is the grown-ups' half.
 */

// ---- The token --------------------------------------------------------------

test("a fresh token is long, random, and url-safe", () => {
  const a = makeResetToken();
  const b = makeResetToken();
  assert.notEqual(a.token, b.token);
  // base64url, so it survives being pasted out of a mail client and back.
  assert.match(a.token, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.token.length >= 40, a.token);
});

test("only the hash is ever meant to be stored", () => {
  const { token, tokenHash } = makeResetToken();
  assert.notEqual(tokenHash, token);
  assert.equal(tokenHash, hashResetToken(token));
  // Same shape as a session token's hash: sha256, hex.
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
});

test("and the window is the one the screens promise", () => {
  const { expiresAt } = makeResetToken();
  const minutes = (expiresAt.getTime() - Date.now()) / 60000;
  assert.ok(Math.abs(minutes - RESET_WINDOW_MINUTES) < 1, String(minutes));
});

// ---- Whether a presented link may be spent ----------------------------------

test("a live one may", () => {
  assert.equal(resetState({ expiresAt: new Date(Date.now() + 60_000), usedAt: null }), "ok");
});

test("a spent one is told apart from a missing one", () => {
  // Somebody who clicks twice — or whose mail client prefetched the link —
  // should be told what happened, not given the blank "not recognised" that
  // invites them to assume they mistyped.
  assert.equal(resetState({ expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() }), "used");
  assert.equal(resetState(null), "unknown");
  assert.notEqual(RESET_MESSAGES.used, RESET_MESSAGES.unknown);
});

test("and so is an expired one", () => {
  assert.equal(resetState({ expiresAt: new Date(Date.now() - 1000), usedAt: null }), "expired");
  assert.match(RESET_MESSAGES.expired, /expired/);
});

test("spent beats expired, because it is the more useful thing to say", () => {
  // A link that was used and then sat around long enough to expire should say
  // "already used" — that tells somebody their password probably changed.
  const row = { expiresAt: new Date(Date.now() - 1000), usedAt: new Date(Date.now() - 2000) };
  assert.equal(resetState(row), "used");
});

test("none of the three says whether an account exists", () => {
  for (const message of Object.values(RESET_MESSAGES)) {
    assert.doesNotMatch(message, /account (does not|doesn't) exist|no such/i);
  }
});

// ---- The link ---------------------------------------------------------------

test("the link is built from configured truth, or not at all", () => {
  // Never from the request's Host header. A reset link hands over an account to
  // whoever holds it, and a header an attacker controls would let them have it
  // built to point at their own machine and emailed to the real owner.
  const before = process.env.APP_URL;
  try {
    delete process.env.APP_URL;
    assert.equal(resetLink("abc"), null);

    process.env.APP_URL = "https://hearth.example.com";
    assert.equal(resetLink("abc"), "https://hearth.example.com/reset/abc");
  } finally {
    if (before === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = before;
  }
});

test("a trailing slash in the setting does not become a double one in the link", () => {
  const before = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://hearth.example.com/";
    assert.equal(resetLink("abc"), "https://hearth.example.com/reset/abc");
  } finally {
    if (before === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = before;
  }
});

test("and a token is escaped on its way into one", () => {
  const before = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://hearth.example.com";
    assert.equal(resetLink("a/b?c"), "https://hearth.example.com/reset/a%2Fb%3Fc");
  } finally {
    if (before === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = before;
  }
});
