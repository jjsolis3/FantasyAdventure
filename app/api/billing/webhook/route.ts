import { readEvent } from "@/lib/billing/stripe-events";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";
import { syncStripeEvent } from "@/lib/billing/stripe-sync";
import { webhookSecret } from "@/lib/billing/stripe-plans";

export const dynamic = "force-dynamic";
// Node rather than edge: the signature is an HMAC from `node:crypto`, and the
// raw body has to arrive unmangled.
export const runtime = "nodejs";

/**
 * Where Stripe tells us what happened.
 *
 * **This endpoint is the authority on what a family is paying for, and the
 * browser never is.** A checkout redirect lands on a URL anybody can visit and
 * proves nothing at all; a family's plan changes here or it does not change.
 *
 * The route itself is deliberately four steps and no judgement, because every
 * decision worth making is somewhere it can be tested without a Stripe account:
 *
 *   1. `verifyStripeSignature` — did this come from Stripe, unaltered, recently
 *   2. `readEvent` — what does it say, in this app's own terms
 *   3. `syncStripeEvent` — is it new, is it in order, write it
 *   4. answer 200
 *
 * **Reading the body as text is not a style choice.** The signature covers the
 * bytes that arrived, so parsing JSON first and re-serialising breaks
 * verification for any payload whose key order or number formatting differs by
 * a character — which is most of them, eventually, and none of them
 * reproducibly.
 *
 * **Almost everything answers 200**, including duplicates, events about things
 * this app does not care about, and payloads it cannot make sense of. A non-2xx
 * tells Stripe to deliver again, for three days, with backoff — which is right
 * for "the database was down" and actively harmful for "this event is not
 * something I will ever be able to use". The reply body says which happened, so
 * a delivery can be read back in the Stripe dashboard without guessing.
 *
 * The exception is an unverified signature, which gets a 400: something is
 * wrong that retrying cannot fix, and it should be loud.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = webhookSecret();
  if (!secret) {
    // Nothing is configured, so nothing can be verified — and an endpoint that
    // accepted unverified writes to billing while a key was missing would be a
    // far worse thing than one that is switched off.
    return Response.json({ error: "Billing is not configured here." }, { status: 503 });
  }

  const rawBody = await request.text();
  const verdict = verifyStripeSignature({
    rawBody,
    header: request.headers.get("stripe-signature"),
    secret,
  });

  if (!verdict.ok) {
    console.warn(`[billing] rejected a webhook: ${verdict.reason}`);
    return Response.json({ error: verdict.reason }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed by us and still not JSON. Retrying will not improve it.
    return Response.json({ ok: true, ignored: "not json" });
  }

  const reading = readEvent(payload as Parameters<typeof readEvent>[0]);

  try {
    const outcome = await syncStripeEvent(reading);

    if (outcome.applied) {
      console.log(
        `[billing] ${outcome.householdId} → ${outcome.plan ?? "plan unchanged"} (${outcome.status})`,
      );
      return Response.json({ ok: true, applied: true });
    }

    // Worth a line in the log, not worth a retry. `unknown-household` in
    // particular means somebody's metadata points at a family that is not here,
    // and no amount of redelivery will change that.
    console.log(`[billing] not applied (${outcome.why}): ${outcome.detail}`);
    return Response.json({ ok: true, applied: false, why: outcome.why });
  } catch (error) {
    // The one case that *should* be retried: the write itself failed. Stripe
    // will come back, and the event id it carries means the second attempt
    // cannot double-apply.
    console.error("[billing] could not record a webhook:", error);
    return Response.json({ error: "Could not record that event." }, { status: 500 });
  }
}
