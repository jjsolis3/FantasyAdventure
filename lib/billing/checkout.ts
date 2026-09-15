/**
 * Who may buy what, before any of it touches Stripe.
 *
 * The sending end's equivalent of `planInvite`: a plain function over its
 * inputs, so every refusal can be read and tested without a card, an account,
 * or a browser session. The action that follows it decides nothing — it asks
 * this, and then either redirects somebody to Stripe or shows them a sentence.
 *
 * Keeping it separate matters more here than anywhere else in the app, because
 * the alternative is a set of rules whose only test is "put a real card into a
 * real checkout and see what happens", which is a test nobody runs twice.
 */

import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";
import { priceFor, purchasablePlans, webhookSecret } from "@/lib/billing/stripe-plans";

export type CheckoutPlan =
  | { ok: true; plan: Plan; priceId: string }
  | { ok: false; reason: string; sendToPortal?: boolean };

/**
 * Whether this person may put this household on this plan.
 *
 *   - **The household's `OWNER` only.** The role has said "later, the billing
 *     contact" since the day it existed, and this is later. A `PARENT` may
 *     invite, reset a child's password and fix a sheet; committing the family
 *     to a recurring payment is a different kind of act and belongs to the one
 *     person who answers for them.
 *
 *   - **Not a platform administrator acting for somebody else.** They have a
 *     manual override on `/admin/households` that costs nobody anything, and
 *     putting a stranger's card details in front of them is not support, it is
 *     a mistake waiting to be made.
 *
 *   - **A household already paying goes to the portal, not through checkout
 *     again.** Two live subscriptions against one household is a mess with no
 *     good way out: two invoices, two renewal dates, and a webhook race over
 *     which one owns the plan. Stripe's own portal changes a plan properly,
 *     with proration, and it is one redirect.
 *
 *   - **`HEARTH` and `UNMETERED` are not for sale**, enforced by `priceFor`
 *     returning null for both. `UNMETERED` is what a family running their own
 *     copy gets; if it could be bought, it would be somebody buying their way
 *     to no ceiling at all for whatever the cheapest thing on the page costs.
 */
export function planCheckout(input: {
  actor: { householdId: string | null; householdRole: string | null };
  plan: Plan;
  subscription: { status: SubscriptionStatus; externalSubscriptionId: string | null } | null;
}): CheckoutPlan {
  const { actor, plan, subscription } = input;

  if (!webhookSecret() || purchasablePlans().length === 0) {
    // No secret means no way to be told what happened afterwards, and a
    // checkout whose result nobody can verify is worse than no checkout: the
    // family is charged and the app never finds out.
    return { ok: false, reason: "This copy of Hearthlight does not sell subscriptions." };
  }

  if (!actor.householdId) {
    return { ok: false, reason: "This account is not part of a household yet. Ask an administrator." };
  }

  if (actor.householdRole !== "OWNER") {
    return {
      ok: false,
      reason:
        "Only whoever answers for this family can set up the payment. Ask them to do it from their own account.",
    };
  }

  const priceId = priceFor(plan);
  if (!priceId) {
    return { ok: false, reason: "That plan is not one you can buy." };
  }

  // `PAST_DUE` is deliberately *not* on this list. A family whose card failed
  // needs to fix it, and the portal is where a card gets fixed — sending them
  // through a fresh checkout would leave the broken subscription behind,
  // still failing, still emailing them.
  const live =
    subscription?.externalSubscriptionId &&
    (subscription.status === "ACTIVE" ||
      subscription.status === "TRIALING" ||
      subscription.status === "PAST_DUE");

  if (live) {
    return {
      ok: false,
      sendToPortal: true,
      reason: "This family already has a subscription. Manage it to change plan or card.",
    };
  }

  return { ok: true, plan, priceId };
}

/** Whether there is a subscription for the portal to manage. */
export function canOpenPortal(input: {
  actor: { householdRole: string | null };
  subscription: { externalCustomerId: string | null } | null;
}): boolean {
  return input.actor.householdRole === "OWNER" && Boolean(input.subscription?.externalCustomerId);
}
