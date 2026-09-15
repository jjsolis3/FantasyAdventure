import assert from "node:assert/strict";
import test from "node:test";
import { canOpenPortal, planCheckout } from "../lib/billing/checkout.ts";
import { encodeForm } from "../lib/billing/stripe-api.ts";

/**
 * Who may buy what, and what actually goes on the wire.
 *
 * The sending end of billing cannot be exercised end to end from here — that
 * needs an account, a key and a card — so the parts that *can* be checked are
 * the two that decide anything: the rule in front of the redirect, and the
 * encoding of the request itself.
 *
 * The second matters more than it looks. Stripe accepts a badly nested form and
 * quietly ignores the parts it did not understand, so a checkout can be created
 * with no line item, or — worse — with no `subscription_data[metadata]`, which
 * is the only thing telling the webhook whose subscription it is. A family pays
 * and nothing ever arrives to say so.
 */

const owner = { householdId: "hh_solis", householdRole: "OWNER" };
const parent = { householdId: "hh_solis", householdRole: "PARENT" };

function withBilling(body: () => void) {
  const before = {
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    home: process.env.STRIPE_PRICE_HOMESTEAD,
    keep: process.env.STRIPE_PRICE_KEEP,
  };
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_PRICE_HOMESTEAD = "price_home";
  process.env.STRIPE_PRICE_KEEP = "price_keep";
  try {
    body();
  } finally {
    for (const [key, value] of [
      ["STRIPE_WEBHOOK_SECRET", before.secret],
      ["STRIPE_PRICE_HOMESTEAD", before.home],
      ["STRIPE_PRICE_KEEP", before.keep],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ---- Who may buy -----------------------------------------------------------

test("the person who answers for the family may buy a plan", () => {
  withBilling(() => {
    const verdict = planCheckout({ actor: owner, plan: "HOMESTEAD", subscription: null });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.ok && verdict.priceId, "price_home");
  });
});

test("a parent who does not answer for it may not", () => {
  // `OWNER` has said "later, the billing contact" since the day the role
  // existed, and this is later. Inviting, resetting a child's password and
  // fixing a sheet are one kind of act; committing the family to a recurring
  // payment is another.
  withBilling(() => {
    const verdict = planCheckout({ actor: parent, plan: "HOMESTEAD", subscription: null });
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok ? "" : verdict.reason, /answers for this family/);
  });
});

test("an account in no household cannot buy anything", () => {
  withBilling(() => {
    const verdict = planCheckout({
      actor: { householdId: null, householdRole: null },
      plan: "HOMESTEAD",
      subscription: null,
    });
    assert.equal(verdict.ok, false);
  });
});

// ---- What may be bought ----------------------------------------------------

test("unmetered cannot be bought, whatever is posted", () => {
  // It is what a family running their own copy gets. If it had a price, it
  // would be somebody buying their way to no ceiling at all for whatever the
  // cheapest thing on the page costs.
  withBilling(() => {
    assert.equal(planCheckout({ actor: owner, plan: "UNMETERED", subscription: null }).ok, false);
  });
});

test("nor can the free trial", () => {
  withBilling(() => {
    assert.equal(planCheckout({ actor: owner, plan: "HEARTH", subscription: null }).ok, false);
  });
});

test("nothing can be bought where nothing is sold", () => {
  // A checkout whose result nobody can verify is worse than no checkout: the
  // family is charged and the app never finds out, because the webhook secret
  // is what lets it be told.
  const before = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const verdict = planCheckout({ actor: owner, plan: "HOMESTEAD", subscription: null });
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok ? "" : verdict.reason, /does not sell subscriptions/);
  } finally {
    if (before === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = before;
  }
});

// ---- Already paying --------------------------------------------------------

test("a family already paying is sent to the portal, not through checkout again", () => {
  // Two live subscriptions against one household is a mess with no good way
  // out: two invoices, two renewal dates, and a webhook race over which owns
  // the plan.
  withBilling(() => {
    const verdict = planCheckout({
      actor: owner,
      plan: "KEEP",
      subscription: { status: "ACTIVE", externalSubscriptionId: "sub_1" },
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok ? false : verdict.sendToPortal, true);
  });
});

test("and so is one whose card has failed", () => {
  // Deliberately. A fresh checkout would leave the broken subscription behind,
  // still failing, still emailing them — the card gets fixed in the portal.
  withBilling(() => {
    const verdict = planCheckout({
      actor: owner,
      plan: "HOMESTEAD",
      subscription: { status: "PAST_DUE", externalSubscriptionId: "sub_1" },
    });
    assert.equal(verdict.ok ? false : verdict.sendToPortal, true);
  });
});

test("but one that has ended may start again", () => {
  // The control. A rule that sent everybody with a Stripe id to the portal
  // would strand every family who had ever cancelled.
  withBilling(() => {
    const verdict = planCheckout({
      actor: owner,
      plan: "HOMESTEAD",
      subscription: { status: "CANCELED", externalSubscriptionId: "sub_old" },
    });
    assert.equal(verdict.ok, true);
  });
});

test("and so may one that never had a subscription at all", () => {
  withBilling(() => {
    const verdict = planCheckout({
      actor: owner,
      plan: "HOMESTEAD",
      subscription: { status: "TRIALING", externalSubscriptionId: null },
    });
    assert.equal(verdict.ok, true);
  });
});

// ---- The portal ------------------------------------------------------------

test("there is nothing to manage without a customer", () => {
  assert.equal(
    canOpenPortal({ actor: { householdRole: "OWNER" }, subscription: { externalCustomerId: null } }),
    false,
  );
});

test("and only the owner may manage it", () => {
  const subscription = { externalCustomerId: "cus_1" };
  assert.equal(canOpenPortal({ actor: { householdRole: "OWNER" }, subscription }), true);
  assert.equal(canOpenPortal({ actor: { householdRole: "PARENT" }, subscription }), false);
});

// ---- What goes on the wire -------------------------------------------------

test("a flat field encodes as itself", () => {
  assert.equal(encodeForm({ mode: "subscription" }), "mode=subscription");
});

test("an array of objects gets Stripe's bracket notation", () => {
  // `line_items[0][price]=price_1`, not JSON. Stripe accepts a badly nested
  // form and ignores what it did not understand, so getting this wrong makes a
  // checkout with no line item rather than an error.
  assert.equal(
    encodeForm({ line_items: [{ price: "price_1", quantity: 1 }] }),
    "line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1",
  );
});

test("metadata nests, which is what the webhook depends on", () => {
  // The single most important field in the whole request. Without it every
  // subscription event about this family is refused as carrying no household,
  // and somebody has paid for a plan that never arrives.
  assert.equal(
    encodeForm({ subscription_data: { metadata: { householdId: "hh_solis" } } }),
    "subscription_data%5Bmetadata%5D%5BhouseholdId%5D=hh_solis",
  );
});

test("nothing is sent for a field that was not set", () => {
  // An empty string and an absent field mean different things to Stripe, and
  // sending `customer=` where no customer exists is an error rather than a
  // default.
  assert.equal(encodeForm({ a: "1", b: undefined, c: null }), "a=1");
});

test("values are escaped, not concatenated", () => {
  assert.equal(
    encodeForm({ success_url: "https://x.test/a?done=1&b=2" }),
    "success_url=https%3A%2F%2Fx.test%2Fa%3Fdone%3D1%26b%3D2",
  );
});
