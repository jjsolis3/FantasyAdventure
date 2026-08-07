import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/auth/password.ts";

test("accepts the correct password", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("rejects a wrong password", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("Correct horse battery staple", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("salts every hash independently", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  assert.notEqual(a, b, "identical passwords must not produce identical hashes");
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

test("records its parameters so the cost can be raised later", async () => {
  const hash = await hashPassword("whatever");
  const [scheme, cost, blockSize, parallelism] = hash.split("$");
  assert.equal(scheme, "scrypt");
  assert.equal(Number(cost), 2 ** 15);
  assert.equal(Number(blockSize), 8);
  assert.equal(Number(parallelism), 1);
});

test("verifies against parameters embedded in the hash, not current defaults", async () => {
  // A hash written with a lower cost must still verify after the default rises.
  const legacy =
    "scrypt$1024$8$1$" +
    Buffer.from("sixteenbytesalt!").toString("base64") +
    "$" +
    (await (async () => {
      const { scrypt } = await import("node:crypto");
      const { promisify } = await import("node:util");
      const derive = promisify(scrypt) as (
        p: string,
        s: Buffer,
        k: number,
        o: object,
      ) => Promise<Buffer>;
      const out = await derive("old password", Buffer.from("sixteenbytesalt!"), 64, {
        N: 1024,
        r: 8,
        p: 1,
      });
      return out.toString("base64");
    })());

  assert.equal(await verifyPassword("old password", legacy), true);
  assert.equal(await verifyPassword("wrong", legacy), false);
});

test("returns false rather than throwing on a malformed hash", async () => {
  for (const bad of ["", "garbage", "scrypt$x$8$1$aaaa$bbbb", "scrypt$32768$8$1$$", "a$b$c$d$e$f"]) {
    assert.equal(await verifyPassword("anything", bad), false, `should reject: ${bad}`);
  }
});

test("normalises unicode so the same typed password matches", async () => {
  const composed = "café";       // é as one code point
  const decomposed = "café";    // e + combining acute
  const hash = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, hash), true);
});
