import assert from "node:assert/strict";
import test from "node:test";
import {
  USERNAME_MAX,
  normaliseHandle,
  signInKind,
  signInName,
  usernameProblem,
} from "../lib/auth/handle.ts";

/**
 * What somebody signs in with.
 *
 * Registration required a unique email address, which a nine-year-old has not
 * got. These are the rules that let her have an account of her own instead of
 * `mum+mira@gmail.com` or a shared login — and there are almost none of them
 * left, which is the point.
 *
 * This file previously asserted that a username could not contain a dot, could
 * not contain a space, and had to start with a letter. Every one of those
 * existed so that one box could tell a username from an address by looking at
 * it; the form says which kind it means now, nothing looks, and those went.
 *
 * The `@` ban stayed, for a different and better reason than parsing: a
 * username of `dad@example.com` would mislead a person even though it could
 * never mislead the software.
 */

// ---- What a username may be -------------------------------------------------

test("a username may contain dots, spaces, digits first — anything she likes", () => {
  assert.equal(usernameProblem("mira.b"), null);
  assert.equal(usernameProblem("mira the brave"), null);
  assert.equal(usernameProblem("9lives"), null);
  assert.equal(usernameProblem("🦊"), null);
});

test("except an at-sign", () => {
  // The one restriction left, and it is not about parsing — nothing parses any
  // more. A username of `dad@example.com` would be indistinguishable from a
  // real address in every conversation about who is who.
  assert.match(usernameProblem("dad@example.com") ?? "", /@/);
  assert.match(usernameProblem("mira@home") ?? "", /email address/);
});

test("it only has to be there", () => {
  assert.equal(usernameProblem(""), "Choose a username.");
});

test("and to fit", () => {
  // Not a rule about what it may say — just a bound, so one cannot be pasted in
  // at a length no screen could show.
  assert.equal(usernameProblem("m".repeat(USERNAME_MAX)), null);
  assert.match(usernameProblem("m".repeat(USERNAME_MAX + 1)) ?? "", /at most/);
});

// ---- Typing it back ---------------------------------------------------------

test("case and stray spaces never keep somebody out", () => {
  // A child types her own name with a capital, or a tablet keyboard adds a
  // trailing space. Neither should be a sign-in failure she cannot debug.
  assert.equal(normaliseHandle("  Mira-B  "), "mira-b");
  assert.equal(normaliseHandle("Dad@Example.COM"), "dad@example.com");
});

test("and neither does hitting the space bar twice", () => {
  // Usernames may contain spaces now, so this matters: `mira  b` and `mira b`
  // have to be the same person, or the failure is invisible on screen.
  assert.equal(normaliseHandle("mira  b"), "mira b");
  assert.equal(normaliseHandle("mira\tb"), "mira b");
});

// ---- What the screens show --------------------------------------------------

test("an account shows the address it signs in with", () => {
  assert.equal(signInName({ email: "dad@example.com", username: null }), "dad@example.com");
  assert.equal(signInKind({ email: "dad@example.com", username: null }), "email");
});

test("and a child's shows her username", () => {
  assert.equal(signInName({ email: null, username: "mira-b" }), "mira-b");
  assert.equal(signInKind({ email: null, username: "mira-b" }), "username");
});

test("and the list can say which kind an account is", () => {
  // Two accounts still cannot be confused for each other — no username may look
  // like an address — but a reader should not have to infer it from punctuation
  // either, so the administrator's list says so outright.
  assert.equal(signInKind({ email: null, username: "mira.b" }), "username");
  assert.equal(signInKind({ email: "dad@example.com", username: null }), "email");
});

test("an account with neither says so rather than rendering nothing", () => {
  // The database will not permit this — there is a CHECK constraint — so the
  // only way to see it is a bug. A visible phrase beats an empty gap that looks
  // like a styling problem.
  assert.equal(signInName({ email: null, username: null }), "no sign-in");
  assert.equal(signInKind({ email: null, username: null }), null);
});
