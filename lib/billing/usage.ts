/**
 * What a household has actually used, and the answer to "may it do one more?".
 *
 * The counting half of billing. `lib/billing/plans.ts` says what is allowed and
 * `lib/billing/caps.ts` compares the two; this is the only part that needs a
 * database, which is why it is a separate file — the rules stay testable
 * without one.
 *
 * Every `…VerdictFor` below is a convenience: load the subscription, count the
 * thing, ask the rule. They exist so a call site is one line and cannot get the
 * order wrong, not because they decide anything.
 */

import { db } from "@/lib/db";
import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";
import { UNLIMITED, entitlementsFor, type Entitlements } from "@/lib/billing/plans";
import {
  adventureVerdict,
  campaignVerdict,
  linkVerdict,
  pictureVerdict,
  seatVerdict,
  turnVerdict,
  writingVerdict,
  type Verdict,
} from "@/lib/billing/caps";

/**
 * Adventures that are still going.
 *
 * A finished one has cost what it is ever going to cost, so it does not hold a
 * place. Named here rather than written out at each of the three call sites,
 * because "which states count" is exactly the sort of thing that gets edited in
 * two places out of three.
 */
const LIVE: ("SETUP" | "ACTIVE" | "PAUSED")[] = ["SETUP", "ACTIVE", "PAUSED"];

/**
 * When the current month of the subscription began.
 *
 * Rolled forward from the stored start rather than read from a column that
 * something has to keep up to date. There is no background job in this app and
 * there does not need to be one: a period that has lapsed is a period whose
 * start is a whole number of months ago, and that is arithmetic rather than
 * state. When Stripe is wired in, its `current_period_start` overwrites the
 * stored value on each invoice and this keeps agreeing with it.
 *
 * A household with no subscription is metered by the calendar month, which is
 * the only honest answer available.
 */
export function periodStart(
  subscription: { currentPeriodStart: Date } | null,
  now: Date = new Date(),
): Date {
  if (!subscription) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const start = subscription.currentPeriodStart;
  // Whole months between the two, then clamped back if the day-of-month does
  // not exist in the later month — the 31st of a 30-day month lands on the 1st
  // otherwise, and the period would silently start in the wrong one.
  const months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth());

  const rolled = monthsAfter(start, Math.max(0, months));
  return rolled.getTime() > now.getTime() ? monthsAfter(start, Math.max(0, months - 1)) : rolled;
}

function monthsAfter(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

type SubscriptionRow = {
  plan: Plan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
};

async function subscriptionFor(householdId: string | null): Promise<SubscriptionRow | null> {
  if (!householdId) return null;
  return db.subscription.findUnique({
    where: { householdId },
    select: { plan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true },
  });
}

/** What this household is allowed, right now. */
export async function entitlementsOf(householdId: string | null): Promise<Entitlements> {
  return entitlementsFor(await subscriptionFor(householdId));
}

/**
 * Everything a household has used this period, in one round trip.
 *
 * For the screen that shows it. The gates below each count only the one thing
 * they are about, because a refusal should not cost four queries.
 */
export async function householdUsage(householdId: string) {
  const subscription = await subscriptionFor(householdId);
  const since = periodStart(subscription);

  const [seats, outstandingInvites, campaigns, turns, links] = await Promise.all([
    db.householdMember.count({ where: { householdId } }),
    db.inviteCode.count({
      where: { householdId, grant: "HOUSEHOLD_MEMBER", redeemedById: null },
    }),
    db.campaign.count({
      where: { householdId, status: { in: LIVE } },
    }),
    countTurns(householdId, since),
    db.householdLink.count({
      where: { OR: [{ householdAId: householdId }, { householdBId: householdId }] },
    }),
  ]);

  return {
    entitlements: entitlementsFor(subscription),
    periodStart: since,
    periodEnd: subscription?.currentPeriodEnd ?? null,
    seats,
    /** Seats taken plus codes handed out and not yet used. See `seatsTaken`. */
    seatsTaken: seats + outstandingInvites,
    outstandingInvites,
    campaigns,
    turns,
    links,
  };
}

/**
 * Turns taken since a moment, counted by narration.
 *
 * A turn is three model calls — two that think and one that tells — so counting
 * `AiCall` rows would triple every number on every screen and in every cap.
 * Exactly one of the three narrates, so that is the one counted, and a turn
 * that failed before it got that far is not billed. Charging for the times the
 * storyteller fell over is not a business anybody should want.
 */
async function countTurns(householdId: string, since: Date): Promise<number> {
  return db.aiCall.count({
    where: { householdId, stage: "narrate", ok: true, createdAt: { gte: since } },
  });
}

/**
 * Whether another person may be given a sign-in here.
 *
 * Counts codes already handed out as well as people already in, because
 * registration redeems a code that was valid when it was written — so a
 * household that minted twenty codes in one sitting would otherwise arrive at
 * twenty members having passed the cap exactly zero times.
 */
export async function seatVerdictFor(householdId: string | null): Promise<Verdict> {
  if (!householdId) return { ok: true };

  const [subscription, seats, outstanding] = await Promise.all([
    subscriptionFor(householdId),
    db.householdMember.count({ where: { householdId } }),
    db.inviteCode.count({
      where: { householdId, grant: "HOUSEHOLD_MEMBER", redeemedById: null },
    }),
  ]);

  return seatVerdict(entitlementsFor(subscription), seats + outstanding);
}

/** Whether another adventure may be started. */
export async function campaignVerdictFor(householdId: string): Promise<Verdict> {
  const [subscription, inUse] = await Promise.all([
    subscriptionFor(householdId),
    db.campaign.count({
      where: { householdId, status: { in: LIVE } },
    }),
  ]);

  return campaignVerdict(entitlementsFor(subscription), inUse);
}

/** Whether this family may agree to adventure with one more. */
export async function linkVerdictFor(householdId: string): Promise<Verdict> {
  const [subscription, inUse] = await Promise.all([
    subscriptionFor(householdId),
    db.householdLink.count({
      where: { OR: [{ householdAId: householdId }, { householdBId: householdId }] },
    }),
  ]);

  return linkVerdict(entitlementsFor(subscription), inUse);
}

/**
 * Whether a turn may be taken.
 *
 * On the hot path: every turn asks this, through `loadCampaign`. So an
 * unmetered household is answered without the count — there is no number that
 * could change the answer, and running a `COUNT(*)` over a family's whole
 * month to prove it three times a turn is work done for nothing. Every other
 * plan still pays for its own ceiling, which is the right way round.
 */
export async function turnVerdictFor(householdId: string): Promise<Verdict> {
  const subscription = await subscriptionFor(householdId);
  const entitlements = entitlementsFor(subscription);

  if (entitlements.turnsPerMonth >= UNLIMITED) return turnVerdict(entitlements, 0);

  const used = await countTurns(householdId, periodStart(subscription));
  return turnVerdict(entitlements, used);
}

/** Whether the storyteller may draw for this family. */
export async function pictureVerdictFor(householdId: string | null): Promise<Verdict> {
  return pictureVerdict(entitlementsFor(await subscriptionFor(householdId)));
}

/** Whether this family may start that adventure. */
export async function adventureVerdictFor(
  householdId: string | null,
  storyline: { tier: string },
): Promise<Verdict> {
  return adventureVerdict(entitlementsFor(await subscriptionFor(householdId)), storyline);
}

/** Whether this family may write an adventure of their own. */
export async function writingVerdictFor(householdId: string | null): Promise<Verdict> {
  return writingVerdict(entitlementsFor(await subscriptionFor(householdId)));
}
