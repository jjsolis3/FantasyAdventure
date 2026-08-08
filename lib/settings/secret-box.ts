/**
 * Encrypts secrets that have to live in the database.
 *
 * The point is not that AES is unbreakable — it is that **the key lives in the
 * environment and the ciphertext lives in Postgres**. A database dump, a stray
 * backup, or someone reading rows over your shoulder therefore does not hand
 * over a working API key. Encrypting with a key stored beside the ciphertext
 * would be theatre; this is not that.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM's standard nonce length.
const VERSION = "v1";

/**
 * Reads the encryption secret.
 *
 * `SETTINGS_SECRET` is preferred; `AUTH_SECRET` is accepted because it is
 * already documented and set on existing deployments. Null means no secret is
 * configured, which callers must handle by refusing to store a key rather than
 * quietly saving it in the clear.
 */
export function encryptionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = (env.SETTINGS_SECRET ?? env.AUTH_SECRET ?? "").trim();
  // A one-character secret is worse than none, because it looks configured.
  return secret.length >= 16 ? secret : null;
}

function keyFrom(secret: string): Buffer {
  // The secret is an arbitrary passphrase; AES needs exactly 32 bytes.
  return createHash("sha256").update(secret).digest();
}

export class MissingSecretError extends Error {
  constructor() {
    super(
      "No encryption secret is configured, so an API key cannot be stored safely. " +
        "Set SETTINGS_SECRET (at least 16 characters) in the environment and redeploy.",
    );
    this.name = "MissingSecretError";
  }
}

/** Returns `v1:<iv>:<tag>:<ciphertext>`, all base64. */
export function encryptSecret(plaintext: string, secret: string | null): string {
  if (!secret) throw new MissingSecretError();

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Reverses `encryptSecret`. Returns null rather than throwing on anything
 * malformed or tampered with, so a corrupted row degrades to "no key
 * configured" instead of taking the whole app down.
 */
export function decryptSecret(payload: string | null, secret: string | null): string | null {
  if (!payload || !secret) return null;

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");

    const decipher = createDecipheriv(ALGORITHM, keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong secret, or the row was altered. Either way it is not a usable key.
    return null;
  }
}

/**
 * A safe fragment for the UI: enough to recognise which key is set, not enough
 * to be worth stealing.
 */
export function hintFor(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
