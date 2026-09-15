/**
 * Talking to Stripe.
 *
 * Three calls, ever: make a customer, open a checkout, open the billing
 * portal. Everything else about a subscription's life arrives at the webhook.
 *
 * ## Why `fetch` and not the SDK
 *
 * A judgement call, and a reversible one — if this grows past three endpoints,
 * or somebody wants typed error classes, installing `stripe` and rewriting this
 * file is an afternoon and nothing above it changes.
 *
 * The reasoning for now: the surface is three form-encoded POSTs, none of which
 * can be exercised from this machine anyway without an account, so the library
 * would be a dependency whose value is in code paths the test suite cannot
 * reach. What it *would* have bought — API version pinning, idempotency,
 * explicit error handling — is done here explicitly instead, where it can be
 * read, and the one genuinely fiddly part (Stripe's nested form encoding) is a
 * pure function with tests.
 *
 * The part of Stripe that actually guards money is the webhook signature, and
 * that was hand-written for the opposite reason: so it *could* be tested.
 */

import { randomUUID } from "node:crypto";

const BASE = "https://api.stripe.com";

/**
 * The API shape this code was written against.
 *
 * Pinned rather than left to the account's default, because the account default
 * can be changed in a dashboard by somebody who is not thinking about this
 * repository — and the last thing that moved underneath an integration here was
 * `current_period_start`, which quietly relocated onto the subscription item.
 */
const API_VERSION = "2025-08-27.basil";

export type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Stripe's form encoding, which is not `application/x-www-form-urlencoded` with
 * JSON inside it but a bracket notation over nested objects and arrays:
 *
 *   { line_items: [{ price: "price_1" }] }  →  line_items[0][price]=price_1
 *
 * Written out and tested rather than trusted to a one-liner, because getting it
 * subtly wrong produces a request Stripe accepts while ignoring the part that
 * mattered — a checkout with no line item, or metadata that never arrives, and
 * the metadata is what the webhook reads to know whose subscription this is.
 */
export function encodeForm(input: Record<string, unknown>): string {
  const pairs: string[] = [];

  const walk = (prefix: string, value: unknown): void => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${prefix}[${index}]`, item));
      return;
    }

    if (typeof value === "object") {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${key}]`, nested);
      }
      return;
    }

    pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };

  for (const [key, value] of Object.entries(input)) walk(key, value);
  return pairs.join("&");
}

function secretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

/** Whether this installation can talk to Stripe at all. */
export function stripeConfigured(): boolean {
  return secretKey() !== null;
}

/**
 * One POST, with an idempotency key.
 *
 * The key matters on exactly the calls made here: a double-submitted checkout
 * form, or a retry after a timeout that actually succeeded, would otherwise
 * make a second customer or a second checkout session. Stripe deduplicates on
 * this header for 24 hours, so a caller that can describe "the same request"
 * passes its own key and a caller that cannot gets a fresh one.
 */
export async function stripePost<T>(
  path: string,
  params: Record<string, unknown>,
  options: { idempotencyKey?: string } = {},
): Promise<StripeResult<T>> {
  const key = secretKey();
  if (!key) return { ok: false, error: "Stripe is not configured here." };

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
        "stripe-version": API_VERSION,
        "idempotency-key": options.idempotencyKey ?? randomUUID(),
      },
      body: encodeForm(params),
    });
  } catch (error) {
    // Unreachable rather than refused. Worth telling apart, because one of them
    // is a network to look at and the other is a key to check.
    return {
      ok: false,
      error: `Could not reach Stripe: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; type?: string } }
    | null;

  if (!response.ok) {
    // Stripe's own message, which is written for a developer and is the only
    // useful thing in the log when a price id is wrong or a key is from the
    // other mode. It is never shown to a family — callers substitute their own.
    const said = body?.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, error: said };
  }

  return { ok: true, data: body as T };
}
