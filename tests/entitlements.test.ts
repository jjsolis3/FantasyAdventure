import assert from "node:assert/strict";
import test from "node:test";
import {
  PLANS,
  UNLIMITED,
  defaultPlan,
  describeAllowance,
  entitlementsFor,
} from "../lib/billing/plans.ts";
import {
  adventureVerdict,
  campaignVerdict,
  linkVerdict,
  pictureVerdict,
  remaining,
  seatVerdict,
  turnVerdict,
  writingVerdict,
} from "../lib/billing/caps.ts";
import { periodStart } from "../lib/billing/usage.ts";

/**
 * What a family is allowed, and what happens when they reach it.
 *
 * Every one of these is a refusal that would otherwise be reachable only by
 * driving a browser through a card payment — which is to say, not reachable, and
 * therefore not tested. The whole reason the rules are plain functions taking a
 * number and returning a sentence is that this file can exist.
 */

const homestead = entitlementsFor({ plan: "HOMESTEAD", status: "ACTIVE" });
const hearth = entitlementsFor({ plan: "HEARTH", status: "TRIALING" });
const unmetered = entitlementsFor({ plan: "UNMETERED", status: "ACTIVE" });

// ---- The ladder ------------------------------------------------------------

test("a plan resolves to numbers rather than to a name", () => {
  // The point of the whole module. A cap site asks "how many adventures?" and
  // never "is this household on Homestead?", so pricing can change without
  // hunting down the places that assumed it would not.
  assert.equal(homestead.campaigns, PLANS.HOMESTEAD.campaigns);
  assert.equal(homestead.plan, "HOMESTEAD");
});

test("every plan is more generous than the one below it", () => {
  // Not decoration: a ladder where an upgrade takes something away is a support
  // ticket, and the numbers live far enough from each other to get it wrong.
  const ladder = ["HEARTH", "HOMESTEAD", "KEEP", "UNMETERED"] as const;
  for (let i = 1; i < ladder.length; i += 1) {
    const lower = PLANS[ladder[i - 1]!];
    const upper = PLANS[ladder[i]!];
    assert.ok(upper.seats >= lower.seats, `${ladder[i]} seats`);
    assert.ok(upper.campaigns >= lower.campaigns, `${ladder[i]} campaigns`);
    assert.ok(upper.turnsPerMonth >= lower.turnsPerMonth, `${ladder[i]} turns`);
    assert.ok(upper.linkedHouseholds >= lower.linkedHouseholds, `${ladder[i]} links`);
  }
});

test("a household with no subscription row gets the smallest allowance, not the largest", () => {
  // The fault case, and the direction it fails in is the whole decision.
  // Failing towards free costs a family an upgrade prompt; failing towards
  // unlimited costs the installation money it never charged for.
  const none = entitlementsFor(null);
  assert.equal(none.plan, "HEARTH");
  assert.equal(none.mayPlay, false);
  assert.equal(none.mayStart, false);
});

test("a self-hosted installation is unmetered unless it says otherwise", () => {
  const before = process.env.DEFAULT_PLAN;
  delete process.env.DEFAULT_PLAN;
  assert.equal(defaultPlan(), "UNMETERED");

  process.env.DEFAULT_PLAN = "HEARTH";
  assert.equal(defaultPlan(), "HEARTH");

  // A typo must not stop a family playing. It shows up in the usage screen
  // within a day; a crash at boot shows up at three in the morning.
  process.env.DEFAULT_PLAN = "HOMSTEAD";
  assert.equal(defaultPlan(), "UNMETERED");

  if (before === undefined) delete process.env.DEFAULT_PLAN;
  else process.env.DEFAULT_PLAN = before;
});

// ---- Seats -----------------------------------------------------------------

test("a family with room may invite somebody", () => {
  assert.equal(seatVerdict(homestead, 3).ok, true);
});

test("and one that is full may not", () => {
  const verdict = seatVerdict(homestead, PLANS.HOMESTEAD.seats);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /room for 6 people/);
});

test("an unmetered family is never full", () => {
  assert.equal(seatVerdict(unmetered, 500).ok, true);
});

// ---- Adventures ------------------------------------------------------------

test("a family on the trial gets one adventure at a time", () => {
  assert.equal(campaignVerdict(hearth, 0).ok, true);
  assert.equal(campaignVerdict(hearth, 1).ok, false);
});

test("the refusal says what to do about it", () => {
  // A cap is a commercial decision and it should read like one, not like the
  // software having gone wrong in front of two children.
  const verdict = campaignVerdict(hearth, 1);
  assert.match(verdict.ok ? "" : verdict.reason, /Finish one, or move to a larger plan/);
});

// ---- Turns -----------------------------------------------------------------

test("a family with turns left may take one", () => {
  assert.equal(turnVerdict(homestead, 399).ok, true);
});

test("and one that has used the month may not", () => {
  const verdict = turnVerdict(homestead, 400);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /all 400 turns/);
});

// ---- Dunning ---------------------------------------------------------------

test("a failed payment stops new things without stopping the story", () => {
  // The rule with a child on the other side of it. A card that fails on
  // Thursday must not end Saturday's chapter — she did not enter the details,
  // and she is in the middle of something.
  const pastDue = entitlementsFor({ plan: "HOMESTEAD", status: "PAST_DUE" });

  assert.equal(pastDue.mayPlay, true);
  assert.equal(turnVerdict(pastDue, 10).ok, true);

  assert.equal(pastDue.mayStart, false);
  assert.equal(campaignVerdict(pastDue, 0).ok, false);
  assert.equal(seatVerdict(pastDue, 0).ok, false);
  assert.equal(linkVerdict(pastDue, 0).ok, false);
});

test("and says it is about the payment rather than about the count", () => {
  // Being told "you have reached your limit" when you have used one of six is
  // the kind of wrong answer that costs an afternoon.
  const pastDue = entitlementsFor({ plan: "HOMESTEAD", status: "PAST_DUE" });
  const verdict = seatVerdict(pastDue, 1);
  assert.match(verdict.ok ? "" : verdict.reason, /problem with the payment/);
});

test("a cancelled subscription stops play too, and says nothing is lost", () => {
  const gone = entitlementsFor({ plan: "HOMESTEAD", status: "CANCELED" });
  assert.equal(gone.mayPlay, false);

  const verdict = turnVerdict(gone, 0);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /still here to read/);
});

test("a trial is a working account, not a broken one", () => {
  assert.equal(hearth.mayPlay, true);
  assert.equal(hearth.mayStart, true);
});

// ---- Pictures --------------------------------------------------------------

test("drawing is off on the trial and on above it", () => {
  assert.equal(pictureVerdict(hearth).ok, false);
  assert.equal(pictureVerdict(homestead).ok, true);
});

test("and the refusal points at the better alternative", () => {
  const verdict = pictureVerdict(hearth);
  assert.match(verdict.ok ? "" : verdict.reason, /drawing somebody in the family made/);
});

// ---- Linked families -------------------------------------------------------

test("a family may adventure with as many others as its plan says", () => {
  assert.equal(linkVerdict(homestead, 4).ok, true);
  assert.equal(linkVerdict(homestead, 5).ok, false);
});

// ---- Saying it on a screen -------------------------------------------------

test("a ceiling is shown as a fraction and no ceiling is shown as a number", () => {
  assert.equal(describeAllowance(3, 6), "3 of 6");
  assert.equal(describeAllowance(3, UNLIMITED), "3");
});

test("what is left is nothing rather than a negative number", () => {
  assert.equal(remaining(7, 6), 0);
  assert.equal(remaining(4, 6), 2);
  assert.equal(remaining(4, UNLIMITED), null);
});

// ---- The month -------------------------------------------------------------

test("a household with no subscription is metered by the calendar", () => {
  const start = periodStart(null, new Date("2026-03-17T08:00:00Z"));
  assert.equal(start.toISOString(), "2026-03-01T00:00:00.000Z");
});

test("a period that has lapsed rolls forward without anything having to write it down", () => {
  // There is no scheduler in this app and there does not need to be one: a
  // period that has lapsed is one whose start is a whole number of months ago,
  // and that is arithmetic rather than state.
  const subscription = { currentPeriodStart: new Date("2026-01-09T00:00:00Z") };
  const start = periodStart(subscription, new Date("2026-04-20T00:00:00Z"));
  assert.equal(start.toISOString(), "2026-04-09T00:00:00.000Z");
});

test("and before the day of the month comes round, it is still the previous one", () => {
  const subscription = { currentPeriodStart: new Date("2026-01-09T00:00:00Z") };
  const start = periodStart(subscription, new Date("2026-04-02T00:00:00Z"));
  assert.equal(start.toISOString(), "2026-03-09T00:00:00.000Z");
});

test("a subscription that started on the 31st gets a February that exists", () => {
  // The bug the clamp is for. Month arithmetic that overflows lands in the
  // month *after* next — a naive "January 31st plus one month" is March 3rd —
  // so a family billed on the 31st would have had their February turns counted
  // from a day in March, and February would have had no ceiling at all.
  const subscription = { currentPeriodStart: new Date("2026-01-31T00:00:00Z") };
  const start = periodStart(subscription, new Date("2026-03-01T00:00:00Z"));
  assert.equal(start.toISOString(), "2026-02-28T00:00:00.000Z");
});

test("and mid-February is still inside the month that began on the 31st", () => {
  // The control for the test above: the roll-forward must not run ahead of
  // itself. A period beginning 31 January covers 15 February, so counting from
  // the 28th would quietly hand the family a second month's turns.
  const subscription = { currentPeriodStart: new Date("2026-01-31T00:00:00Z") };
  const start = periodStart(subscription, new Date("2026-02-15T00:00:00Z"));
  assert.equal(start.toISOString(), "2026-01-31T00:00:00.000Z");
});

// ---- What comes with which plan --------------------------------------------

test("the free plan gets the adventures that come with it and not the rest", () => {
  // Five whole adventures, played properly — not a sampler. What is held back
  // is *more* of them, which is a different kind of limit from a trial that
  // stops mid-story.
  assert.equal(hearth.extraAdventures, false);
  assert.equal(adventureVerdict(hearth, { tier: "STARTER" }).ok, true);
  assert.equal(adventureVerdict(hearth, { tier: "EXTRA" }).ok, false);
});

test("and a paid one gets all of them", () => {
  assert.equal(adventureVerdict(homestead, { tier: "EXTRA" }).ok, true);
  assert.equal(adventureVerdict(unmetered, { tier: "EXTRA" }).ok, true);
});

test("the refusal says the library they have is still theirs", () => {
  // Not "upgrade to continue". A family on the free plan has not run out of
  // anything — they are looking at something that was never included.
  const verdict = adventureVerdict(hearth, { tier: "EXTRA" });
  assert.match(verdict.ok ? "" : verdict.reason, /already in your library are yours/);
});

test("writing your own comes with a larger plan", () => {
  assert.equal(writingVerdict(hearth).ok, false);
  assert.equal(writingVerdict(homestead).ok, true);
});

test("and the refusal says what it is actually for", () => {
  // The upgrade that makes the storyteller worth having rather than the one
  // that makes it bigger, and the wording should say so — a family deciding
  // whether to pay is deciding about this.
  const verdict = writingVerdict(hearth);
  assert.match(verdict.ok ? "" : verdict.reason, /your own street, with your own cat/);
});

test("a family that has stopped paying keeps the adventures it wrote", () => {
  // The whole shape of these ceilings: "may I add one more", never "give it
  // back". Writing a *new* one stops; the ones already written are not gated
  // here or anywhere — nothing in the app asks this before letting a family
  // play or edit what is already theirs.
  const gone = entitlementsFor({ plan: "HOMESTEAD", status: "CANCELED" });
  assert.equal(writingVerdict(gone).ok, false);
  assert.match(writingVerdict(gone).ok ? "" : (writingVerdict(gone) as { reason: string }).reason, /subscription has ended/);
});

test("every plan above the free one includes writing and the whole library", () => {
  // The ladder again, for the two capabilities that are booleans rather than
  // numbers — a paid plan that quietly lacked one would be a refund request.
  for (const plan of ["HOMESTEAD", "KEEP", "UNMETERED"] as const) {
    assert.equal(PLANS[plan].writeAdventures, true, `${plan} writing`);
    assert.equal(PLANS[plan].extraAdventures, true, `${plan} library`);
  }
});
