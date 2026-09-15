/**
 * Proving a webhook really came from Stripe.
 *
 * The whole of billing's security rests here. Everything else about
 * subscriptions is a consequence of what this function says yes to: anybody who
 * can forge a request past it can set any family to any plan, for free,
 * forever.
 *
 * Written out rather than taken from the SDK, for one reason that matters —
 * **it can be tested**. The interesting cases are a wrong signature, a replayed
 * one, and a rotated secret, and none of those get exercised when the check is
 * a library call somebody trusts. They are all covered in
 * `tests/stripe-billing.test.ts`, which needs no network, no account and no
 * card. The algorithm itself is four lines and Stripe documents it.
 *
 * Four things this has to get right, each of which is a real way people get it
 * wrong:
 *
 *   1. **The raw body, byte for byte.** The signature is over the bytes that
 *      arrived, so a route that parses JSON first and re-serialises has already
 *      lost. See the route: it reads `await request.text()` and passes it
 *      straight here.
 *   2. **Constant-time comparison.** A `===` on a hex digest leaks the correct
 *      value one character at a time to anybody willing to make enough requests.
 *   3. **A tolerance on the timestamp.** Without it, a captured request is
 *      replayable for ever — and a replayed `subscription.updated` can put a
 *      cancelled family back on a paid plan.
 *   4. **More than one `v1=`.** Stripe sends several during a secret rotation,
 *      signed with the old secret and the new one. A check that reads only the
 *      first rejects half the traffic for the duration of a rotation, which is
 *      exactly when nobody wants to be debugging webhooks.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * How far out of date a request may be, in seconds.
 *
 * Stripe's own default, and it is a compromise rather than a preference: the
 * signature is made when Stripe sends, and a retry after an outage can be
 * genuinely old. Five minutes is long enough for a slow proxy and short enough
 * that a captured request is not a lasting key.
 */
export const TOLERANCE_SECONDS = 300;

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: "unsigned" | "malformed" | "stale" | "mismatch" };

type Parsed = { timestamp: number; signatures: string[] };

/**
 * Pulls `t=` and every `v1=` out of the `Stripe-Signature` header.
 *
 * The header is a comma-separated list of `key=value`, and unknown schemes —
 * `v0=`, whatever comes next — are ignored rather than rejected, so a future
 * addition does not break a working integration.
 */
function parseHeader(header: string): Parsed | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at === -1) continue;

    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();

    if (key === "t") {
      const seconds = Number(value);
      if (!Number.isFinite(seconds)) return null;
      timestamp = seconds;
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/** Compares two hex digests without leaking where they first differ. */
function sameDigest(a: string, b: string): boolean {
  // Length is not a secret, and `timingSafeEqual` throws on a mismatch rather
  // than returning false, so this has to be checked first either way.
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    // Not hex at all. A forgery, or a header mangled in transit; neither is a
    // request to act on.
    return false;
  }
}

/**
 * Whether this request really came from Stripe, unaltered and recently.
 *
 * `nowSeconds` is an argument rather than a call to `Date.now()` so the
 * staleness rule can be tested without waiting five minutes.
 */
export function verifyStripeSignature(input: {
  /** The request body exactly as it arrived. Not re-serialised JSON. */
  rawBody: string;
  /** The `Stripe-Signature` header, or null when there was not one. */
  header: string | null;
  secret: string;
  nowSeconds?: number;
}): SignatureVerdict {
  const { rawBody, header, secret } = input;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!header) return { ok: false, reason: "unsigned" };

  const parsed = parseHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };

  // Both directions. A timestamp far in the future is as much a sign of
  // something wrong as one far in the past, and accepting it would hand back
  // the replay window this exists to close.
  if (Math.abs(now - parsed.timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  // Any one of them matching is enough — see the note about rotation above.
  const matched = parsed.signatures.some((candidate) => sameDigest(candidate, expected));
  return matched ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * Makes a header the way Stripe would, for tests.
 *
 * Exported deliberately. A test that builds its own header inline is a test
 * that can drift from the verifier it is checking until both agree on something
 * Stripe does not do — the fixture and the code under test have to share one
 * definition of the format, and this is it.
 */
export function signForTesting(rawBody: string, secret: string, timestamp: number): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}
