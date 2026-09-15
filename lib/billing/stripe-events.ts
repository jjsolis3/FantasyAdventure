/**
 * What a Stripe event means in this app's own terms.
 *
 * The whole of the translation, as a pure function over a plain object. It
 * takes no database and no network, which is what lets the interesting cases —
 * a cancellation, a failed card, a plan whose price nobody configured, a status
 * Stripe has not invented yet — be tested against fixture payloads rather than
 * against a live account and a test card.
 *
 * The shapes below are deliberately *minimal* rather than imported from a
 * Stripe SDK. Only a handful of fields matter and the rest change between API
 * versions; describing exactly what is read means an upgrade that moves
 * something is a type error here instead of a quiet null in production.
 */

import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";
import { planFor } from "@/lib/billing/stripe-plans";

/** Only the parts of a Stripe subscription this app reads. */
export type StripeSubscription = {
  id?: unknown;
  status?: unknown;
  customer?: unknown;
  current_period_start?: unknown;
  current_period_end?: unknown;
  metadata?: { householdId?: unknown } | null;
  items?: {
    data?: {
      price?: { id?: unknown } | null;
      current_period_start?: unknown;
      current_period_end?: unknown;
    }[];
  } | null;
};

/** Only the parts of a Stripe event this app reads. */
export type StripeEvent = {
  id?: unknown;
  type?: unknown;
  created?: unknown;
  data?: { object?: unknown } | null;
};

/** What a subscription event says to write. */
export type SubscriptionUpdate = {
  /** Which family, taken from the metadata the checkout put there. */
  householdId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  /** Null means *do not touch the plan* — see `planFor`. */
  plan: Plan | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

export type EventReading =
  | { kind: "subscription"; eventId: string; at: Date; update: SubscriptionUpdate }
  /** A real event this app has nothing to do about. Acknowledged, not acted on. */
  | { kind: "ignored"; eventId: string; at: Date; why: string }
  /** Something wrong enough that acting on it would be guessing. */
  | { kind: "unusable"; why: string };

/**
 * The events worth listening for.
 *
 * `checkout.session.completed` is **not** on this list, deliberately. It says a
 * purchase happened; it does not say what state the subscription is in a moment
 * later, and acting on it means writing ACTIVE for a card that is about to be
 * declined. The subscription events carry the actual state and arrive for every
 * later change as well — one source, not two that can disagree.
 */
const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/**
 * Stripe's vocabulary for the state of an account, in ours.
 *
 * The mapping is not one to one and the differences are the point:
 *
 *   - `unpaid` arrives when every retry has failed. It is tempting to call that
 *     cancelled, and wrong: Stripe has not cancelled anything, and a family
 *     halfway through a chapter on a Saturday should not be stopped by a retry
 *     schedule. `PAST_DUE` already means *finish what you started, begin
 *     nothing new*, which is exactly right for it.
 *   - `incomplete` is the gap between checkout and a card clearing — most often
 *     somebody in the middle of a bank's verification step. Treating it as
 *     cancelled would cut off a person who is three seconds from paying.
 *   - `incomplete_expired` is Stripe giving up on that first payment. Nothing
 *     was ever paid, so there is nothing to keep open.
 *   - `paused` means collection is deliberately stopped. Nobody is being
 *     charged and nothing is cancelled.
 *
 * Anything unrecognised returns null, and the caller leaves the row alone. That
 * direction is chosen: a future Stripe status quietly resolving to ACTIVE gives
 * away the product, and one quietly resolving to CANCELED stops a paying
 * family's children mid-story. Doing nothing loudly is the only option that is
 * wrong in a way somebody can see and undo.
 */
export function statusFrom(stripeStatus: string): SubscriptionStatus | null {
  switch (stripeStatus) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Stripe sends unix seconds; this app stores dates. */
function moment(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

/**
 * The customer id, whether it arrived expanded or not.
 *
 * Stripe sends a bare id most of the time and a whole object when something
 * upstream asked for it to be expanded. Both are ordinary, and a reader that
 * handles one of them works until the day somebody changes a setting.
 */
function customerId(value: unknown): string | null {
  if (typeof value === "string") return text(value);
  if (value && typeof value === "object" && "id" in value) {
    return text((value as { id?: unknown }).id);
  }
  return null;
}

/**
 * When the current period began and ended.
 *
 * Read from the subscription, falling back to its first item. Stripe moved
 * these onto the item in a recent API version, and an integration that reads
 * only the old place starts meting turns from the epoch the day the account's
 * API version is bumped — silently, and in the customer's favour, which is the
 * kind of bug that is found in a bill rather than in a log.
 */
function period(subscription: StripeSubscription): { start: Date | null; end: Date | null } {
  const item = subscription.items?.data?.[0];
  return {
    start: moment(subscription.current_period_start) ?? moment(item?.current_period_start),
    end: moment(subscription.current_period_end) ?? moment(item?.current_period_end),
  };
}

/**
 * Reads an event, or says why it cannot be acted on.
 *
 * Everything that could be missing is checked, because everything here arrives
 * from outside: a malformed payload must produce a refusal this app can log,
 * never an exception in a route that Stripe then retries for three days.
 */
export function readEvent(event: StripeEvent): EventReading {
  const eventId = text(event.id);
  const type = text(event.type);
  if (!eventId || !type) return { kind: "unusable", why: "event has no id or type" };

  // Stripe always sends `created`; falling back to now rather than refusing,
  // because a missing timestamp is a reason to be careful about ordering and
  // not a reason to drop a real cancellation on the floor.
  const at = moment(event.created) ?? new Date();

  if (!SUBSCRIPTION_EVENTS.has(type)) {
    return { kind: "ignored", eventId, at, why: `${type} is not a subscription event` };
  }

  const subscription = event.data?.object as StripeSubscription | undefined;
  if (!subscription || typeof subscription !== "object") {
    return { kind: "unusable", why: `${type} carried no subscription` };
  }

  const externalSubscriptionId = text(subscription.id);
  const externalCustomerId = customerId(subscription.customer);
  const status = text(subscription.status);

  if (!externalSubscriptionId || !externalCustomerId || !status) {
    return { kind: "unusable", why: `${type} is missing an id, a customer or a status` };
  }

  // The household rides on the subscription's metadata, put there by checkout.
  // Without it there is no way to know whose this is — and guessing by customer
  // id would mean trusting a column that the same event is supposed to be
  // setting. Refuse, and let the log say which subscription needs looking at.
  const householdId = text(subscription.metadata?.householdId);
  if (!householdId) {
    return { kind: "unusable", why: `subscription ${externalSubscriptionId} carries no householdId` };
  }

  const mapped = statusFrom(status);
  if (!mapped) {
    return { kind: "unusable", why: `unrecognised Stripe status "${status}"` };
  }

  const priceId = text(subscription.items?.data?.[0]?.price?.id);
  const { start, end } = period(subscription);

  return {
    kind: "subscription",
    eventId,
    at,
    update: {
      householdId,
      externalCustomerId,
      externalSubscriptionId,
      // Null when the price is unknown to this installation — a plan somebody
      // created in the Stripe dashboard and never configured here. The status
      // still applies; the allowance is left as it was rather than guessed.
      plan: priceId ? planFor(priceId) : null,
      status: mapped,
      currentPeriodStart: start,
      currentPeriodEnd: end,
    },
  };
}
