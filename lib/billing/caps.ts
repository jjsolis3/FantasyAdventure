/**
 * The ceilings, one function each.
 *
 * Every one of these takes an allowance and a count and returns yes or a
 * sentence. None of them touches the database, holds a session, or knows what
 * screen it is being asked from — which is the point: a refusal that can only
 * be reached by driving a browser through a card payment is a refusal that
 * stops being tested, and then stops being true.
 *
 * The wording matters more than it looks. These sentences are read by a parent
 * in front of two children who were promised an adventure, so each one says
 * what the limit is, what they have, and what to do about it — never just "not
 * permitted". A cap is a commercial decision and it should sound like one,
 * rather than like the software having gone wrong.
 */

import { UNLIMITED, type Entitlements } from "@/lib/billing/plans";

export type Verdict = { ok: true } | { ok: false; reason: string };

const OK: Verdict = { ok: true };

/**
 * What to say when the account itself is the problem rather than the count.
 *
 * Checked first by every verdict below, because "your card was declined" is a
 * more useful thing to be told than "you have reached the limit of a plan you
 * are no longer on".
 */
function accountProblem(entitlements: Entitlements): string | null {
  if (entitlements.status === "PAST_DUE") {
    return (
      "There is a problem with the payment for this family, so nothing new can be started " +
      "until it is sorted out. Adventures already under way carry on as normal."
    );
  }
  if (entitlements.status === "CANCELED") {
    return (
      "This family's subscription has ended. Everything you have written is still here and " +
      "still yours to read — starting something new needs the subscription back."
    );
  }
  return null;
}

/** Whether another person may be given a sign-in in this household. */
export function seatVerdict(entitlements: Entitlements, seatsInUse: number): Verdict {
  const problem = accountProblem(entitlements);
  if (problem) return { ok: false, reason: problem };

  if (seatsInUse >= entitlements.seats) {
    return {
      ok: false,
      reason:
        `This family has room for ${entitlements.seats} ` +
        `${entitlements.seats === 1 ? "person" : "people"}, and all of them are taken. ` +
        "Remove somebody who no longer plays, or move to a larger plan.",
    };
  }
  return OK;
}

/**
 * Whether another adventure may be started.
 *
 * `inUse` counts adventures that are set up, being played or paused — not
 * finished ones. A family that has completed nine stories has not used anything
 * up; the cost is in the playing, and a chronicle nobody is adding to costs
 * nothing to keep.
 */
export function campaignVerdict(entitlements: Entitlements, inUse: number): Verdict {
  const problem = accountProblem(entitlements);
  if (problem) return { ok: false, reason: problem };

  if (inUse >= entitlements.campaigns) {
    return {
      ok: false,
      reason:
        `This family can have ${entitlements.campaigns} ` +
        `${entitlements.campaigns === 1 ? "adventure" : "adventures"} on the go at once. ` +
        "Finish one, or move to a larger plan.",
    };
  }
  return OK;
}

/** Whether this family may agree to adventure with another one. */
export function linkVerdict(entitlements: Entitlements, inUse: number): Verdict {
  const problem = accountProblem(entitlements);
  if (problem) return { ok: false, reason: problem };

  if (inUse >= entitlements.linkedHouseholds) {
    return {
      ok: false,
      reason:
        `This family can adventure with ${entitlements.linkedHouseholds} other ` +
        `${entitlements.linkedHouseholds === 1 ? "family" : "families"}, and already does. ` +
        "Part company with one, or move to a larger plan.",
    };
  }
  return OK;
}

/**
 * Whether a turn may be taken.
 *
 * This is the only cap that gates *play* rather than *starting things*, which
 * is why it asks `mayPlay` rather than `mayStart`. A family whose card failed
 * on Thursday should still be able to finish Saturday's chapter.
 *
 * The warning at nine tenths is not decoration. Running out of turns in the
 * middle of a chapter is the worst possible moment to find out there was a
 * limit, and a family that knows it is close can choose to stop somewhere
 * sensible instead.
 */
export function turnVerdict(entitlements: Entitlements, usedThisPeriod: number): Verdict {
  if (!entitlements.mayPlay) {
    return {
      ok: false,
      reason:
        "This family's subscription has ended, so the storyteller has stopped. Everything " +
        "already written is still here to read.",
    };
  }

  if (usedThisPeriod >= entitlements.turnsPerMonth) {
    return {
      ok: false,
      reason:
        `This family has used all ${entitlements.turnsPerMonth} turns for this month. ` +
        "They come back at the start of the next one, or a larger plan has more.",
    };
  }
  return OK;
}

/** Whether the storyteller may draw for this family. */
export function pictureVerdict(entitlements: Entitlements): Verdict {
  if (!entitlements.pictures) {
    return {
      ok: false,
      reason:
        "Drawing is not part of this family's plan. The story carries on without pictures — " +
        "and a drawing somebody in the family made beats anything a machine does.",
    };
  }
  if (!entitlements.mayPlay) {
    return { ok: false, reason: "This family's subscription has ended." };
  }
  return OK;
}

/**
 * How much of an allowance is left, for a screen rather than a gate.
 *
 * Returns null where there is no ceiling, so a self-hosted family is shown
 * nothing rather than a bar that is always empty.
 */
export function remaining(used: number, allowed: number): number | null {
  if (allowed >= UNLIMITED) return null;
  return Math.max(0, allowed - used);
}
