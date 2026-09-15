"use server";

/**
 * Starting a subscription, and managing one.
 *
 * Two redirects to Stripe and nothing else. Neither of these decides what a
 * family is paying for — that is the webhook's job and only the webhook's, so
 * nothing here writes `plan` or `status`. What they do write is the customer
 * id, once, so a second attempt reuses the customer rather than making another.
 *
 * **Where the family comes back to is not where the app learns anything.** The
 * success url is a page anybody can visit; it says "thank you" and shows
 * whatever the webhook has recorded by then, which may be nothing yet. That is
 * correct and it is why the page says so rather than claiming a plan is live.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { appUrl } from "@/lib/auth/password-reset";
import { canOpenPortal, planCheckout } from "@/lib/billing/checkout";
import { stripePost } from "@/lib/billing/stripe-api";
import type { Plan } from "@/generated/prisma/enums";

export type BillingFormState = { error: string } | null;

const PLANS = ["HEARTH", "HOMESTEAD", "KEEP", "UNMETERED"] as const;

/** Where Stripe sends people back to. Built from `APP_URL`, never from a header. */
function returnUrls(): { success: string; cancel: string } | null {
  // The same rule, and the same reason, as a password reset link: a `Host` an
  // attacker controls would let them have the return built to point at their
  // own machine. Unset, the feature is off rather than guessed at.
  const base = appUrl();
  if (!base) return null;
  return {
    success: `${base}/settings/billing?done=1`,
    cancel: `${base}/settings/billing?cancelled=1`,
  };
}

/**
 * The Stripe customer for this household, making one if there is not yet one.
 *
 * Stored before checkout rather than after, so that a family who abandons a
 * checkout and comes back does not accumulate a customer per attempt. The
 * idempotency key is the household's own id, which makes "the same request"
 * mean exactly what it should here: one customer per family, however many times
 * the button is pressed.
 */
async function customerFor(
  subscriptionId: string,
  existing: string | null,
  who: { householdName: string; email: string | null; householdId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (existing) return { ok: true, id: existing };

  const made = await stripePost<{ id: string }>(
    "/v1/customers",
    {
      name: who.householdName,
      ...(who.email ? { email: who.email } : {}),
      // So somebody looking at a payment in the Stripe dashboard can tell which
      // family it is without a lookup, and so support can go the other way.
      metadata: { householdId: who.householdId },
    },
    { idempotencyKey: `customer:${who.householdId}` },
  );

  if (!made.ok) return { ok: false, error: made.error };

  await db.subscription.update({
    where: { id: subscriptionId },
    data: { externalCustomerId: made.data.id },
  });

  return { ok: true, id: made.data.id };
}

export async function startCheckoutAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const actor = await requireHouseholdParent();

  const wanted = String(formData.get("plan") ?? "");
  if (!PLANS.includes(wanted as (typeof PLANS)[number])) return { error: "That is not a plan." };
  const plan = wanted as Plan;

  const urls = returnUrls();
  if (!urls) {
    return { error: "This installation has no address set, so Stripe has nowhere to send you back to." };
  }

  const subscription = actor.householdId
    ? await db.subscription.findUnique({
        where: { householdId: actor.householdId },
        select: {
          id: true,
          status: true,
          externalCustomerId: true,
          externalSubscriptionId: true,
          household: { select: { name: true } },
        },
      })
    : null;

  const verdict = planCheckout({
    actor: { householdId: actor.householdId, householdRole: actor.user.householdRole },
    plan,
    subscription,
  });
  if (!verdict.ok) return { error: verdict.reason };

  // `planCheckout` has already refused every case where this could be missing,
  // but the compiler does not know that and a cast would be a worse way to say
  // so than a check that can never fire.
  if (!subscription || !actor.householdId) {
    return { error: "This account is not part of a household yet. Ask an administrator." };
  }

  const customer = await customerFor(subscription.id, subscription.externalCustomerId, {
    householdName: subscription.household.name,
    email: actor.user.email,
    householdId: actor.householdId,
  });
  if (!customer.ok) {
    console.error("[billing] could not create a customer:", customer.error);
    return { error: "Could not reach the payment service. Try again in a minute." };
  }

  const session = await stripePost<{ url?: string }>("/v1/checkout/sessions", {
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: verdict.priceId, quantity: 1 }],
    success_url: urls.success,
    cancel_url: urls.cancel,
    // Both, deliberately. `client_reference_id` is what a checkout-session
    // event would carry, and the subscription metadata is what every
    // *subscription* event carries — and the subscription events are the ones
    // this app actually listens to. Without the second, the webhook would have
    // no way to know whose subscription this is and would refuse it.
    client_reference_id: actor.householdId,
    subscription_data: { metadata: { householdId: actor.householdId } },
  });

  if (!session.ok || !session.data.url) {
    console.error("[billing] could not open a checkout:", session.ok ? "no url" : session.error);
    return { error: "Could not open the payment page. Try again in a minute." };
  }

  redirect(session.data.url);
}

/**
 * Stripe's own screen for changing a card, changing a plan, or stopping.
 *
 * Deliberately not rebuilt in this app. A cancellation flow, a card form and a
 * proration preview are each a week of work and a compliance surface, and
 * Stripe already has all three — with the added property that a cancellation
 * arrives back here as a webhook, which is the only thing this app trusts
 * anyway.
 */
export async function openBillingPortalAction(
  _prev: BillingFormState,
  _formData: FormData,
): Promise<BillingFormState> {
  const actor = await requireHouseholdParent();

  const base = appUrl();
  if (!base) return { error: "This installation has no address set." };

  const subscription = actor.householdId
    ? await db.subscription.findUnique({
        where: { householdId: actor.householdId },
        select: { externalCustomerId: true },
      })
    : null;

  if (!canOpenPortal({ actor: { householdRole: actor.user.householdRole }, subscription })) {
    return { error: "There is nothing to manage yet." };
  }

  const session = await stripePost<{ url?: string }>("/v1/billing_portal/sessions", {
    customer: subscription!.externalCustomerId,
    return_url: `${base}/settings/billing`,
  });

  if (!session.ok || !session.data.url) {
    console.error("[billing] could not open the portal:", session.ok ? "no url" : session.error);
    return { error: "Could not open the billing page. Try again in a minute." };
  }

  redirect(session.data.url);
}
