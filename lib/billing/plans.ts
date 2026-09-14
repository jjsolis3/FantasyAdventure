/**
 * What a household is allowed to do, as numbers.
 *
 * This module holds no database client and no session, deliberately. It answers
 * one question — *given this subscription, what is the allowance?* — and the
 * whole of the answer is a plain object of numbers and booleans. That is what
 * makes every cap in the app testable without a browser, a card, or a Stripe
 * account, and it is why the rest of the code never asks "is this household on
 * the Homestead plan?".
 *
 * **Capabilities, not plan names.** A cap site that reads `plan === "HOMESTEAD"`
 * is a cap site that has to be found and edited every time the pricing changes,
 * and there is always one that gets missed. A cap site that reads
 * `entitlements.campaigns` never changes again.
 *
 * **Hard numbers, not feature flags.** A turn is three model calls before any
 * picture, and a family playing a long Saturday can take forty turns — a
 * hundred and twenty calls. A plan that says "images: yes" and nothing about
 * volume is a plan where one enthusiastic household eats the margin of ten.
 * Every allowance here is a ceiling, and `AiCall` has carried a household id
 * since the day households existed precisely so this could be measured before
 * it was ever priced.
 */

import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";

/** No ceiling. Written out rather than `Infinity` so it survives JSON. */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

/** What a plan permits, before anything about the state of the account. */
export type Allowance = {
  /** People with a sign-in of their own in this household. */
  seats: number;
  /** Adventures on the go at once. Finished ones are not counted. */
  campaigns: number;
  /** Turns in a billing period. One turn is three model calls. */
  turnsPerMonth: number;
  /** Other families this one may agree to adventure with. */
  linkedHouseholds: number;
  /** Whether the storyteller may draw. */
  pictures: boolean;
};

/**
 * The ladder.
 *
 * The names are the app's own rather than Bronze/Silver/Gold, because a family
 * choosing one should be able to tell what it is from the word.
 */
export const PLANS: Record<Plan, Allowance> = {
  /**
   * Try it. A parent and a child, one adventure, an evening or two a week.
   *
   * Sized so a family can find out whether their children like this before
   * anybody is asked for a card — sixty turns is several real sessions — and
   * not so large that a household never needs anything else. No pictures:
   * drawing is the single most expensive thing here per unit of delight.
   */
  HEARTH: {
    seats: 4,
    campaigns: 1,
    turnsPerMonth: 60,
    linkedHouseholds: 1,
    pictures: false,
  },

  /** One family, playing properly. The plan almost everybody should be on. */
  HOMESTEAD: {
    seats: 6,
    campaigns: 3,
    turnsPerMonth: 400,
    linkedHouseholds: 5,
    pictures: true,
  },

  /** Cousins, grandparents, three adventures running at once. */
  KEEP: {
    seats: 12,
    campaigns: 8,
    turnsPerMonth: 1200,
    linkedHouseholds: 20,
    pictures: true,
  },

  /**
   * No ceiling at all.
   *
   * What a family running their own copy on their own machine gets, and what
   * every household that existed before any of this was built was given by the
   * migration. Nobody on a self-hosted installation with a local model agreed
   * to a turn limit, and inventing one for them retrospectively would be a
   * worse thing to do than not having limits at all.
   *
   * Also the honest answer for the operator's own household, which should not
   * be metered against itself.
   */
  UNMETERED: {
    seats: UNLIMITED,
    campaigns: UNLIMITED,
    turnsPerMonth: UNLIMITED,
    linkedHouseholds: UNLIMITED,
    pictures: true,
  },
};

/**
 * The plan a brand-new household starts on.
 *
 * `UNMETERED` by default, because this repository is something a family can
 * clone and run at home, and the default behaviour of a thing you host yourself
 * should not be a sales funnel. An installation that sells subscriptions sets
 * `DEFAULT_PLAN=HEARTH` and every household registered from then on arrives on
 * the trial.
 *
 * Unrecognised values fall back to `UNMETERED` rather than throwing: a typo in
 * an environment variable should not stop a family playing, and the failure it
 * would cause on a paid installation — everybody on unlimited — is loud in the
 * usage screen within a day, where a crash loop at boot is loud at three in the
 * morning.
 */
export function defaultPlan(): Plan {
  const named = process.env.DEFAULT_PLAN?.trim().toUpperCase();
  return named && named in PLANS ? (named as Plan) : "UNMETERED";
}

/**
 * The allowance, and what the state of the account does to it.
 *
 * Two booleans rather than one, because "stopped paying" and "cannot play" are
 * not the same event and should not happen on the same day. A card that fails
 * mid-campaign takes away the ability to *start* things — new adventures, new
 * invitations, new families — while leaving the adventure already under way
 * playable to its end. There is a nine-year-old on the other side of that
 * decision, and she did not enter the card details.
 *
 * Only a cancellation stops play, and even then nothing is deleted: the
 * household keeps its chronicle, and reading it back is not gated on anything.
 */
export type Entitlements = Allowance & {
  plan: Plan;
  status: SubscriptionStatus;
  /** May take a turn in an adventure already under way. */
  mayPlay: boolean;
  /** May start an adventure, invite somebody, or link to another family. */
  mayStart: boolean;
};

export function entitlementsFor(
  subscription: { plan: Plan; status: SubscriptionStatus } | null,
): Entitlements {
  // A household with no subscription row is not an ordinary state — the
  // migration gave one to everybody and registration writes one in the same
  // transaction as the household — so this is the fault case, and it resolves
  // to the smallest allowance rather than the largest. Failing towards "free"
  // costs a family an upgrade prompt; failing towards "unlimited" costs the
  // installation money it never charged for.
  const plan = subscription?.plan ?? "HEARTH";
  const status = subscription?.status ?? "CANCELED";

  return {
    ...PLANS[plan],
    plan,
    status,
    mayPlay: status !== "CANCELED",
    mayStart: status === "TRIALING" || status === "ACTIVE",
  };
}

/** For a screen: "4 of 6", or "4" when there is no ceiling to speak of. */
export function describeAllowance(used: number, allowed: number): string {
  return allowed >= UNLIMITED ? `${used}` : `${used} of ${allowed}`;
}
