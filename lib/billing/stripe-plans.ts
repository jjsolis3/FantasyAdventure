/**
 * Which Stripe price is which plan.
 *
 * The translation layer, and the only place either system knows the other's
 * vocabulary. Everything else in the app asks `entitlementsFor` for numbers;
 * everything in Stripe deals in price ids; this is the seam.
 *
 * **Prices live in the environment, not the database.** A price id is
 * deployment configuration — test mode and live mode have different ones, and
 * so does every developer's own Stripe account. Putting them in a table means a
 * staging price can be restored into production by a backup, and then a family
 * is charged the wrong amount by a row nobody remembers writing.
 *
 * No Stripe SDK here, or anywhere in this stage. A price id is a string.
 */

import type { Plan } from "@/generated/prisma/enums";

/** The plans a family could be charged for, in the order they are offered. */
export const SELLABLE: Plan[] = ["HOMESTEAD", "KEEP"];

const ENV_NAMES: Partial<Record<Plan, string>> = {
  HOMESTEAD: "STRIPE_PRICE_HOMESTEAD",
  KEEP: "STRIPE_PRICE_KEEP",
};

/**
 * The price for a plan, or null when there is not one.
 *
 * Null for three different reasons, all of which mean the same thing to a
 * caller — *this cannot be bought* — so they are not distinguished here:
 *
 *   - `HEARTH` is the trial. Nobody pays for it.
 *   - `UNMETERED` is what a family running their own copy gets, and what every
 *     household had before subscriptions existed. **Checkout must refuse it**,
 *     or somebody buys their way to no ceiling for the price of the cheapest
 *     thing on the page.
 *   - Nothing is configured yet, which is the state this installation is in.
 */
export function priceFor(plan: Plan): string | null {
  const name = ENV_NAMES[plan];
  if (!name) return null;
  return process.env[name]?.trim() || null;
}

/**
 * The plan a price id means, or null.
 *
 * Built fresh each call rather than cached at module load: this runs a handful
 * of times a month, and a cached map is a map that disagrees with the
 * environment after somebody fixes a typo and restarts nothing.
 *
 * **Two plans sharing a price resolves to neither.** A misconfiguration that
 * maps one price to two plans has no right answer, and picking the first would
 * silently put families on whichever happened to be declared first. Returning
 * null makes the webhook leave the plan alone and say so — recoverable, and
 * visible in the log rather than in a family's allowance.
 */
export function planFor(priceId: string): Plan | null {
  const wanted = priceId.trim();
  if (!wanted) return null;

  const matches = SELLABLE.filter((plan) => priceFor(plan) === wanted);
  return matches.length === 1 ? matches[0]! : null;
}

/** The plans this installation has actually configured a price for. */
export function purchasablePlans(): Plan[] {
  return SELLABLE.filter((plan) => priceFor(plan) !== null);
}

/** Whether this installation is selling anything at all. */
export function billingConfigured(): boolean {
  return purchasablePlans().length > 0 && Boolean(webhookSecret());
}

/** The secret the webhook signature is checked against. */
export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
