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
 * **There is no warning before this bites, and there should be.** Running out
 * in the middle of a chapter is the worst possible moment to discover there was
 * a limit — a family that knew it was close could have stopped somewhere
 * sensible. `/settings` shows the month's count, which is not the same thing:
 * nobody opens settings mid-game. The place it belongs is the table itself, a
 * line above the turn button once the last tenth is gone, and it is not built
 * yet. Said here rather than left as an absence, because an unwritten warning
 * looks exactly like a warning nobody needed.
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
 * Whether this family may start that adventure.
 *
 * Only ever about `EXTRA` ones, and only ever about *starting*. A family
 * already partway through an adventure that later becomes locked keeps playing
 * it — the gate is here, at setup, and never in `loadCampaign`. A cap that
 * reached into a story already being told would be the one thing these must
 * never do.
 *
 * A family's own adventure is theirs whatever they pay, which falls out of the
 * tier rather than needing a case here: nothing written by a household is ever
 * marked `EXTRA`.
 */
export function adventureVerdict(
  entitlements: Entitlements,
  storyline: { tier: string },
): Verdict {
  const problem = accountProblem(entitlements);
  if (problem) return { ok: false, reason: problem };

  if (storyline.tier === "EXTRA" && !entitlements.extraAdventures) {
    return {
      ok: false,
      reason:
        "That adventure comes with a larger plan. The ones already in your library are yours to " +
        "play as often as you like.",
    };
  }
  return OK;
}

/**
 * Whether this family may write an adventure of their own.
 *
 * The upgrade that makes the storyteller worth having rather than the one that
 * makes it bigger. Note what this does *not* gate: a family who wrote
 * adventures and then moved to a smaller plan keeps every one of them, keeps
 * playing them, and keeps editing them. Only writing a new one stops — the same
 * "may I add one more" shape as every other ceiling here.
 */
export function writingVerdict(entitlements: Entitlements): Verdict {
  const problem = accountProblem(entitlements);
  if (problem) return { ok: false, reason: problem };

  if (!entitlements.writeAdventures) {
    return {
      ok: false,
      reason:
        "Writing your own adventures comes with a larger plan — it is the part that lets the " +
        "storyteller tell a story about your own street, with your own cat in it.",
    };
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
