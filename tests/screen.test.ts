import { strict as assert } from "node:assert";
import { test } from "node:test";
import { generateScreenCode } from "../lib/auth/invite-code.ts";
import { normaliseScreenCode } from "../lib/game/screen.ts";

test("screen: the code is six characters, grouped for reading across a room", () => {
  const code = generateScreenCode();
  assert.match(code, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
});

test("screen: the code avoids characters that look like each other", () => {
  // Read off a television by somebody holding a phone, so O/0 and I/1/L are the
  // difference between pairing and a family retyping the same code three times.
  const forbidden = /[O01IL]/;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    assert.ok(!forbidden.test(generateScreenCode()), "generated a look-alike character");
  }
});

test("screen: codes do not repeat themselves", () => {
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 500; attempt += 1) seen.add(generateScreenCode());
  // Not a distribution test — just that it is not returning a constant.
  assert.ok(seen.size > 400, `only ${seen.size} distinct codes in 500`);
});

test("screen: the dash is optional", () => {
  assert.equal(normaliseScreenCode("K3M9PQ"), "K3M-9PQ");
  assert.equal(normaliseScreenCode("K3M-9PQ"), "K3M-9PQ");
});

test("screen: typing it in lower case works", () => {
  assert.equal(normaliseScreenCode("k3m-9pq"), "K3M-9PQ");
});

test("screen: a phone keyboard's extra spaces do not matter", () => {
  assert.equal(normaliseScreenCode("  K3M 9PQ "), "K3M-9PQ");
  assert.equal(normaliseScreenCode("K3M - 9PQ"), "K3M-9PQ");
});

test("screen: something the wrong length is left alone rather than mangled", () => {
  // It will simply not match a row. The important part is that it is not padded
  // or truncated into somebody else's code.
  assert.equal(normaliseScreenCode("K3M"), "K3M");
  assert.equal(normaliseScreenCode("K3M9PQXYZ"), "K3M9PQXYZ");
});
