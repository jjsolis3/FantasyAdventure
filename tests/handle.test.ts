import assert from "node:assert/strict";
import test from "node:test";
import {
  USERNAME_MAX,
  looksLikeEmail,
  normaliseHandle,
  signInName,
  usernameProblem,
} from "../lib/auth/handle.ts";

/**
 * What somebody signs in with.
 *
 * Registration required a unique email address, which a nine-year-old has not
 * got. These are the rules that let her have an account of her own instead of
 * `mum+mira@gmail.com` or a shared login.
 */

// ---- Telling the two apart --------------------------------------------------

test("an address is recognised by its at-sign", () => {
  assert.equal(looksLikeEmail("dad@example.com"), true);
});

test("and a username has none, so nothing can be read both ways", () => {
  // This is why the check is the `@` and not a full address pattern. A username
  // is forbidden from containing one, so the two sets cannot overlap and no
  // string is ambiguous.
  assert.equal(looksLikeEmail("mira-b"), false);
  assert.equal(usernameProblem("mira@b"), "A username can use letters, numbers, dashes and underscores — like mira-b.");
});

test("a half-typed address is an invalid address, not a surprising username", () => {
  // `mira@` reads as an email attempt, so the error a child gets is "that does
  // not look like an email address" rather than a complaint about punctuation
  // in a username she never meant to create.
  assert.equal(looksLikeEmail("mira@"), true);
});

// ---- Normalising ------------------------------------------------------------

test("case and stray spaces never keep somebody out", () => {
  // A child types her own name with a capital, or a tablet keyboard adds a
  // trailing space. Neither should be a sign-in failure she cannot debug.
  assert.equal(normaliseHandle("  Mira-B  "), "mira-b");
  assert.equal(normaliseHandle("Dad@Example.COM"), "dad@example.com");
});

// ---- What a username may be -------------------------------------------------

test("an ordinary one is fine", () => {
  assert.equal(usernameProblem("mira-b"), null);
  assert.equal(usernameProblem("wren_9"), null);
});

test("it has to start with a letter", () => {
  // So a username is never mistaken for an id, and never begins with the
  // punctuation a child would have to remember was there.
  assert.match(usernameProblem("9wren") ?? "", /start with a letter/);
  assert.match(usernameProblem("-mira") ?? "", /start with a letter/);
});

test("dots are out, so nothing ever looks half like an address", () => {
  assert.notEqual(usernameProblem("mira.b"), null);
});

test("and so are spaces", () => {
  // "mira b" typed back with two spaces is a login failure a nine-year-old
  // cannot diagnose, and one she would blame on herself.
  assert.notEqual(usernameProblem("mira b"), null);
});

test("too short and too long are both refused, in words that say which", () => {
  assert.match(usernameProblem("ab") ?? "", /at least/);
  assert.match(usernameProblem("m".repeat(USERNAME_MAX + 1)) ?? "", /at most/);
});

test("an empty one is refused rather than accepted as a blank name", () => {
  assert.notEqual(usernameProblem(""), null);
});

// ---- What the screens show --------------------------------------------------

test("an account shows the address it signs in with", () => {
  assert.equal(signInName({ email: "dad@example.com", username: null }), "dad@example.com");
});

test("and a child's shows her username", () => {
  assert.equal(signInName({ email: null, username: "mira-b" }), "mira-b");
});

test("an account with neither says so rather than rendering nothing", () => {
  // The database will not permit this — there is a CHECK constraint — so the
  // only way to see it is a bug. A visible phrase beats an empty gap that looks
  // like a styling problem.
  assert.equal(signInName({ email: null, username: null }), "no sign-in");
});
