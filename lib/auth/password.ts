import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// promisify resolves to scrypt's three-argument overload, which drops the
// options parameter the tuning below depends on, so the signature is restated.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// scrypt rather than argon2id. argon2id is the better algorithm on paper, but
// every Node binding for it is a native module, and this image is Alpine/musl —
// exactly the packaging surface that already cost us a broken deploy once.
// scrypt is built into Node, needs no compilation, and at these parameters is
// comfortably strong for a family game. RFC 7914 recommends N >= 2^15 for
// interactive logins.
const COST = 2 ** 15; // ~50ms and ~32MB per hash
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Node caps scrypt's working memory at 32MB by default, which N=2^15 exceeds.
const MAX_MEMORY = 64 * 1024 * 1024;

const PREFIX = "scrypt";

/**
 * Hashes a password into a self-describing string:
 * `scrypt$N$r$p$<salt-base64>$<hash-base64>`
 *
 * Embedding the parameters means the cost can be raised later without
 * invalidating existing hashes — old ones still verify against their own
 * recorded settings.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  })) as Buffer;

  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verifies a password against a stored hash. Returns false rather than throwing
 * on a malformed hash, so a corrupted row denies access instead of 500ing.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelism = Number(parallelRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) {
    return false;
  }

  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(hashRaw, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = (await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAX_MEMORY,
    })) as Buffer;

    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
