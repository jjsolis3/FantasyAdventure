import assert from "node:assert/strict";
import test from "node:test";
import {
  TOLERANCE_SECONDS,
  signForTesting,
  verifyStripeSignature,
} from "../lib/billing/stripe-signature.ts";
import { readEvent, statusFrom } from "../lib/billing/stripe-events.ts";
import { billingConfigured, planFor, priceFor, purchasablePlans } from "../lib/billing/stripe-plans.ts";

/**
 * The receiving end of billing, before a single card exists.
 *
 * Everything here runs with no network, no Stripe account and no key, which is
 * the entire reason the webhook was built as three pure functions and a thin
 * route. The cases worth testing are a forged signature, a replayed one, a
 * rotated secret, an out-of-order delivery and a status Stripe has not invented
 * yet — and not one of those is reachable by clicking through a checkout with a
 * test card.
 */

const SECRET = "whsec_a_test_secret";
const OTHER_SECRET = "whsec_the_one_being_rotated_out";
const NOW = 1_800_000_000;

// ---- Proving it came from Stripe -------------------------------------------

test("a request signed with the right secret is accepted", () => {
  const body = '{"id":"evt_1"}';
  const header = signForTesting(body, SECRET, NOW);
  assert.equal(verifyStripeSignature({ rawBody: body, header, secret: SECRET, nowSeconds: NOW }).ok, true);
});

test("a request with no signature at all is not", () => {
  const verdict = verifyStripeSignature({ rawBody: "{}", header: null, secret: SECRET, nowSeconds: NOW });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "unsigned");
});

test("a signature made with the wrong secret is refused", () => {
  // The forgery case. Anybody who gets past this can set any family to any plan
  // for nothing, for ever.
  const body = '{"id":"evt_1"}';
  const header = signForTesting(body, "whsec_not_ours", NOW);
  const verdict = verifyStripeSignature({ rawBody: body, header, secret: SECRET, nowSeconds: NOW });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "mismatch");
});

test("a body altered after signing is refused", () => {
  // The signature covers the bytes, which is why the route reads text and never
  // re-serialises JSON. One character is enough.
  const header = signForTesting('{"amount":500}', SECRET, NOW);
  const verdict = verifyStripeSignature({
    rawBody: '{"amount":100}',
    header,
    secret: SECRET,
    nowSeconds: NOW,
  });
  assert.equal(verdict.ok, false);
});

test("a captured request stops working once it is stale", () => {
  // Without this a recorded delivery is a permanent key — and a replayed
  // `subscription.updated` puts a cancelled family back on a paid plan.
  const body = '{"id":"evt_1"}';
  const header = signForTesting(body, SECRET, NOW);
  const later = NOW + TOLERANCE_SECONDS + 1;

  const verdict = verifyStripeSignature({ rawBody: body, header, secret: SECRET, nowSeconds: later });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "stale");
});

test("and one from just inside the window still works", () => {
  // The control. A staleness check that refused everything would pass the test
  // above while breaking every real delivery.
  const body = '{"id":"evt_1"}';
  const header = signForTesting(body, SECRET, NOW);
  const later = NOW + TOLERANCE_SECONDS - 1;
  assert.equal(
    verifyStripeSignature({ rawBody: body, header, secret: SECRET, nowSeconds: later }).ok,
    true,
  );
});

test("a timestamp far in the future is refused too", () => {
  const body = '{"id":"evt_1"}';
  const header = signForTesting(body, SECRET, NOW + 10_000);
  const verdict = verifyStripeSignature({ rawBody: body, header, secret: SECRET, nowSeconds: NOW });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "stale");
});

test("during a secret rotation, either signature is enough", () => {
  // Stripe sends several `v1=` while two secrets are live. A check that reads
  // only the first rejects half the traffic for the length of the rotation —
  // which is exactly when nobody wants to be debugging webhooks.
  const body = '{"id":"evt_1"}';
  const old = signForTesting(body, OTHER_SECRET, NOW);
  const fresh = signForTesting(body, SECRET, NOW);
  const both = `${old},${fresh.split(",")[1]}`;

  assert.equal(verifyStripeSignature({ rawBody: body, header: both, secret: SECRET, nowSeconds: NOW }).ok, true);
  assert.equal(
    verifyStripeSignature({ rawBody: body, header: both, secret: OTHER_SECRET, nowSeconds: NOW }).ok,
    true,
  );
});

test("a header with no signature in it is malformed, not a mismatch", () => {
  const verdict = verifyStripeSignature({
    rawBody: "{}",
    header: `t=${NOW}`,
    secret: SECRET,
    nowSeconds: NOW,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "malformed");
});

test("rubbish where the digest should be does not throw", () => {
  // It arrives from outside. A crash here is a 500, and a 500 is three days of
  // Stripe retrying something that will never work.
  const verdict = verifyStripeSignature({
    rawBody: "{}",
    header: `t=${NOW},v1=not-hex-at-all`,
    secret: SECRET,
    nowSeconds: NOW,
  });
  assert.equal(verdict.ok, false);
});

// ---- Which price is which plan ---------------------------------------------

function withEnv(vars: Record<string, string | undefined>, body: () => void) {
  const before: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    body();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("a configured price maps to its plan and back", () => {
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home", STRIPE_PRICE_KEEP: "price_keep" }, () => {
    assert.equal(priceFor("HOMESTEAD"), "price_home");
    assert.equal(planFor("price_keep"), "KEEP");
  });
});

test("nothing is purchasable until a price is configured", () => {
  withEnv({ STRIPE_PRICE_HOMESTEAD: undefined, STRIPE_PRICE_KEEP: undefined }, () => {
    assert.deepEqual(purchasablePlans(), []);
    assert.equal(planFor("price_home"), null);
  });
});

test("unmetered can never be bought", () => {
  // It is what a self-hosted family gets and what every household had before
  // subscriptions existed. A price on it would be somebody buying their way to
  // no ceiling at all for whatever the cheapest thing on the page costs.
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home" }, () => {
    assert.equal(priceFor("UNMETERED"), null);
    assert.equal(priceFor("HEARTH"), null);
    assert.ok(!purchasablePlans().includes("UNMETERED"));
  });
});

test("one price configured for two plans resolves to neither", () => {
  // A misconfiguration with no right answer. Picking the first would quietly
  // put families on whichever plan happened to be declared first, which is a
  // billing error nobody would notice for a month.
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_same", STRIPE_PRICE_KEEP: "price_same" }, () => {
    assert.equal(planFor("price_same"), null);
  });
});

test("billing is not configured without a webhook secret, whatever the prices say", () => {
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home", STRIPE_WEBHOOK_SECRET: undefined }, () => {
    assert.equal(billingConfigured(), false);
  });
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home", STRIPE_WEBHOOK_SECRET: SECRET }, () => {
    assert.equal(billingConfigured(), true);
  });
});

// ---- Stripe's vocabulary in ours -------------------------------------------

test("a paying account can play and can start things", () => {
  assert.equal(statusFrom("active"), "ACTIVE");
  assert.equal(statusFrom("trialing"), "TRIALING");
});

test("a failed card stops new things without stopping the story", () => {
  assert.equal(statusFrom("past_due"), "PAST_DUE");
});

test("and so does a card that has run out of retries", () => {
  // Tempting to call `unpaid` cancelled. Stripe has not cancelled anything, and
  // a child halfway through a chapter on a Saturday should not be stopped by a
  // retry schedule.
  assert.equal(statusFrom("unpaid"), "PAST_DUE");
});

test("somebody in the middle of their bank's verification is not cut off", () => {
  // `incomplete` is the gap between checkout and a card clearing. Treating it
  // as cancelled would stop a person three seconds from paying.
  assert.equal(statusFrom("incomplete"), "PAST_DUE");
});

test("but a first payment Stripe gave up on is the end of it", () => {
  assert.equal(statusFrom("incomplete_expired"), "CANCELED");
  assert.equal(statusFrom("canceled"), "CANCELED");
});

test("a status nobody has seen before changes nothing at all", () => {
  // The direction is chosen. A future Stripe status quietly resolving to ACTIVE
  // gives the product away; one quietly resolving to CANCELED stops a paying
  // family's children mid-story. Doing nothing is the only answer that is wrong
  // in a way somebody can see and undo.
  assert.equal(statusFrom("quantum_superposition"), null);
});

// ---- Reading an event ------------------------------------------------------

function subscriptionEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt_123",
    type: "customer.subscription.updated",
    created: NOW,
    data: {
      object: {
        id: "sub_123",
        status: "active",
        customer: "cus_123",
        current_period_start: NOW,
        current_period_end: NOW + 2_592_000,
        metadata: { householdId: "hh_solis" },
        items: { data: [{ price: { id: "price_home" } }] },
        ...over,
      },
    },
  };
}

test("a subscription event says which family, which plan and what state", () => {
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home" }, () => {
    const reading = readEvent(subscriptionEvent());
    assert.equal(reading.kind, "subscription");
    if (reading.kind !== "subscription") return;

    assert.equal(reading.update.householdId, "hh_solis");
    assert.equal(reading.update.plan, "HOMESTEAD");
    assert.equal(reading.update.status, "ACTIVE");
    assert.equal(reading.update.externalCustomerId, "cus_123");
    assert.equal(reading.update.externalSubscriptionId, "sub_123");
    assert.equal(reading.update.currentPeriodStart?.getTime(), NOW * 1000);
  });
});

test("a customer that arrived expanded reads the same as a bare id", () => {
  // Stripe sends one or the other depending on a setting upstream. A reader
  // that handles one works until the day somebody changes it.
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home" }, () => {
    const reading = readEvent(subscriptionEvent({ customer: { id: "cus_123", object: "customer" } }));
    assert.equal(reading.kind === "subscription" && reading.update.externalCustomerId, "cus_123");
  });
});

test("a period that has moved onto the item is still found", () => {
  // Stripe moved these off the subscription in a recent API version. An
  // integration that reads only the old place starts metering turns from the
  // epoch the day the account's API version is bumped — silently, and in the
  // customer's favour.
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home" }, () => {
    const reading = readEvent(
      subscriptionEvent({
        current_period_start: undefined,
        current_period_end: undefined,
        items: {
          data: [
            {
              price: { id: "price_home" },
              current_period_start: NOW,
              current_period_end: NOW + 100,
            },
          ],
        },
      }),
    );
    assert.equal(reading.kind === "subscription" && reading.update.currentPeriodStart?.getTime(), NOW * 1000);
  });
});

test("a price this installation does not know leaves the plan alone", () => {
  // Somebody made a product in the Stripe dashboard and never configured it
  // here. Whether they are paying is not in doubt; what for is, so the status
  // applies and the allowance does not move.
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home" }, () => {
    const reading = readEvent(subscriptionEvent({ items: { data: [{ price: { id: "price_mystery" } }] } }));
    assert.equal(reading.kind, "subscription");
    if (reading.kind !== "subscription") return;
    assert.equal(reading.update.plan, null);
    assert.equal(reading.update.status, "ACTIVE");
  });
});

test("a subscription with no household on it is refused, not guessed at", () => {
  // Guessing by customer id would mean trusting a column this same event is
  // responsible for setting — and the first event for a new customer would find
  // nothing at all.
  const reading = readEvent(subscriptionEvent({ metadata: {} }));
  assert.equal(reading.kind, "unusable");
});

test("a checkout session is acknowledged and acted on by nothing", () => {
  // Deliberately not a source of truth. It says a purchase happened; it does
  // not say what state the subscription is in a moment later, and acting on it
  // means writing ACTIVE for a card about to be declined.
  const reading = readEvent({
    id: "evt_999",
    type: "checkout.session.completed",
    created: NOW,
    data: { object: { id: "cs_1" } },
  });
  assert.equal(reading.kind, "ignored");
});

test("an event with no id is unusable rather than an exception", () => {
  // It arrives from outside. A throw here is a 500, and a 500 is three days of
  // retries for something that will never work.
  assert.equal(readEvent({ type: "customer.subscription.updated" }).kind, "unusable");
  assert.equal(readEvent({}).kind, "unusable");
});

test("a deletion is read as a cancellation", () => {
  withEnv({ STRIPE_PRICE_HOMESTEAD: "price_home" }, () => {
    const reading = readEvent({
      ...subscriptionEvent({ status: "canceled" }),
      type: "customer.subscription.deleted",
    });
    assert.equal(reading.kind === "subscription" && reading.update.status, "CANCELED");
  });
});
