/**
 * Applying what a webhook said.
 *
 * The only part of the receiving end that touches the database. Reading the
 * event is `stripe-events.ts` and proving it came from Stripe is
 * `stripe-signature.ts`; both are pure, which leaves this with three jobs and
 * no judgement:
 *
 *   1. Refuse an event already dealt with.
 *   2. Refuse an event older than the one already applied.
 *   3. Write the columns.
 *
 * Every outcome is named and returned rather than thrown. A webhook endpoint
 * that throws is a webhook endpoint Stripe retries for three days, so "this was
 * a duplicate" and "this was out of order" have to be ordinary answers that end
 * in a 200 — the delivery succeeded, there was simply nothing left to do.
 */

import { db, isUniqueViolation } from "@/lib/db";
import type { EventReading, SubscriptionUpdate } from "@/lib/billing/stripe-events";

export type SyncOutcome =
  | { applied: true; householdId: string; status: string; plan: string | null }
  | {
      applied: false;
      why: "duplicate" | "out-of-order" | "unknown-household" | "ignored" | "unusable";
      detail: string;
    };

/**
 * Records that this event has been seen, and says whether it is new.
 *
 * The insert *is* the check. Asking first and writing second leaves a window
 * where two concurrent deliveries of the same event both find nothing and both
 * proceed — narrow, and precisely the window a retry storm lands in.
 */
async function claimEvent(eventId: string, type: string, createdAt: Date): Promise<boolean> {
  try {
    await db.webhookEvent.create({ data: { id: eventId, type, createdAt } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Writes a subscription update onto the household it names.
 *
 * The household is found by the id the checkout wrote into the subscription's
 * metadata, never by the customer id. The customer id is a column *this same
 * event is responsible for setting*, so looking a household up by it would mean
 * trusting the answer to the question being asked — and the first event for a
 * new customer would find nothing at all.
 */
async function applyUpdate(update: SubscriptionUpdate, at: Date): Promise<SyncOutcome> {
  const existing = await db.subscription.findUnique({
    where: { householdId: update.householdId },
    select: { id: true, lastEventAt: true, status: true, consentedAt: true },
  });

  if (!existing) {
    // Every household gets a subscription row when it registers, and the
    // migration gave one to everybody who already existed — so this means the
    // metadata names a household that is gone, or one from another
    // installation pointed at the same endpoint. Either way, refusing is right:
    // creating a row here would invent a family.
    return {
      applied: false,
      why: "unknown-household",
      detail: `no subscription row for household ${update.householdId}`,
    };
  }

  // Out of order. Equal timestamps are allowed through — Stripe's `created` has
  // one-second resolution and two genuine events can share a second, where
  // refusing would drop the second of them permanently.
  if (existing.lastEventAt && existing.lastEventAt.getTime() > at.getTime()) {
    return {
      applied: false,
      why: "out-of-order",
      detail: `event from ${at.toISOString()} is older than ${existing.lastEventAt.toISOString()}`,
    };
  }

  const becomingLive = update.status === "ACTIVE" || update.status === "TRIALING";

  await db.subscription.update({
    where: { id: existing.id },
    data: {
      // Null means the price is not one this installation knows about, and the
      // allowance is left exactly as it was rather than guessed at. The status
      // still applies: whether they are paying is not in doubt, only what for.
      ...(update.plan ? { plan: update.plan } : {}),
      status: update.status,
      externalCustomerId: update.externalCustomerId,
      externalSubscriptionId: update.externalSubscriptionId,
      ...(update.currentPeriodStart ? { currentPeriodStart: update.currentPeriodStart } : {}),
      currentPeriodEnd: update.currentPeriodEnd,
      lastEventAt: at,
      // Written once and never rewritten. The record is of *when* a parent was
      // verified, so a later renewal must not move the date — and a
      // cancellation must certainly not clear it, because the consent was still
      // given and the record of it is the point.
      ...(becomingLive && !existing.consentedAt
        ? { consentedAt: at, consentMethod: "stripe_payment" }
        : {}),
    },
  });

  return {
    applied: true,
    householdId: update.householdId,
    status: update.status,
    plan: update.plan,
  };
}

/** Deals with one already-verified event. */
export async function syncStripeEvent(reading: EventReading): Promise<SyncOutcome> {
  if (reading.kind === "unusable") {
    return { applied: false, why: "unusable", detail: reading.why };
  }

  // Claimed before it is examined, so that an event this app ignores is not
  // re-examined on every retry — and so the record says what actually arrived
  // rather than only what was acted on.
  const fresh = await claimEvent(
    reading.eventId,
    reading.kind === "subscription" ? "customer.subscription" : "ignored",
    reading.at,
  );
  if (!fresh) {
    return { applied: false, why: "duplicate", detail: `${reading.eventId} has been seen before` };
  }

  if (reading.kind === "ignored") {
    return { applied: false, why: "ignored", detail: reading.why };
  }

  return applyUpdate(reading.update, reading.at);
}
