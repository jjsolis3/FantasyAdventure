import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { entitlementsOf } from "@/lib/billing/usage";
import { PLANS, UNLIMITED } from "@/lib/billing/plans";
import { purchasablePlans, webhookSecret } from "@/lib/billing/stripe-plans";
import { visibleStorylineWhere } from "@/lib/game/visibility";
import { Alert, Card, PageTitle } from "@/components/ui";
import { READING_LEVEL_LABELS, TONE_LABELS } from "@/components/campaign/options";
import { BuyPlan } from "../billing/plan-forms";

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = {
  HEARTH: "Hearth",
  HOMESTEAD: "Homestead",
  KEEP: "Keep",
  UNMETERED: "Unmetered",
};

const PLAN_BLURBS: Record<string, string> = {
  HOMESTEAD: "One family, playing properly. The plan most households should be on.",
  KEEP: "Cousins, grandparents, and several adventures running at once.",
};

function allowanceLines(plan: keyof typeof PLANS): string[] {
  const allowance = PLANS[plan];
  return [
    `${allowance.seats} people in the family`,
    `${allowance.campaigns} ${allowance.campaigns === 1 ? "adventure" : "adventures"} at once`,
    `${allowance.turnsPerMonth} turns a month`,
    allowance.extraAdventures ? "every adventure in the library" : "the five that come with it",
    allowance.writeAdventures ? "write your own adventures" : null,
    allowance.pictures ? "a picture for every chapter" : null,
  ].filter((line): line is string => line !== null);
}

/**
 * What this family could have.
 *
 * A shop rather than a price list, and the difference matters: the shelves are
 * *stocked*. Every adventure on the installation is shown here whether or not
 * this family's plan opens it, with the lock said out loud — because a family
 * deciding whether an upgrade is worth it cannot decide that against a list of
 * numbers, and hiding what they would get is how a plan page becomes something
 * nobody reads.
 *
 * Kept apart from `/settings/billing`, which answers the other question. This
 * is *what could we have*; that is *what are we paying, and how do we stop*.
 * One is a shop and the other is an account, and putting a cancel button on a
 * shop front is how you get people cancelling.
 */
export default async function StorePage() {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) redirect("/settings");

  const [entitlements, library, ownAdventures] = await Promise.all([
    entitlementsOf(actor.householdId),
    db.storyline.findMany({
      where: { isActive: true, ...visibleStorylineWhere(actor.householdId) },
      select: {
        id: true,
        title: true,
        tagline: true,
        tier: true,
        scope: true,
        householdId: true,
        defaultTone: true,
        readingLevel: true,
        _count: { select: { acts: true } },
      },
      orderBy: [{ tier: "asc" }, { scope: "asc" }, { createdAt: "asc" }],
    }),
    db.storyline.count({ where: { householdId: actor.householdId } }),
  ]);

  const selling = webhookSecret() !== null && purchasablePlans().length > 0;
  const isOwner = actor.user.householdRole === "OWNER";
  const unmetered = entitlements.turnsPerMonth >= UNLIMITED;

  const included = library.filter(
    (storyline) => storyline.tier === "STARTER" || entitlements.extraAdventures,
  );
  const locked = library.filter(
    (storyline) => storyline.tier === "EXTRA" && !entitlements.extraAdventures,
  );

  const upgrades = purchasablePlans().filter((plan) => plan !== entitlements.plan);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={PLAN_NAMES[entitlements.plan] ?? entitlements.plan}
        title="The shelf"
        lead="Every adventure on this server, and what a larger plan would open."
      />

      <p className="mb-8 flex flex-wrap gap-4 text-sm">
        <Link href="/settings" className="text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
        <Link href="/settings/billing" className="text-hearth-400 underline hover:text-hearth-200">
          What you are paying
        </Link>
      </p>

      {/* ---- What is on the shelf --------------------------------------- */}

      <Card className="mb-6">
        <h2 className="font-display mb-1 text-xl text-hearth-100">
          Yours to play{" "}
          <span className="text-base text-hearth-400">({included.length})</span>
        </h2>
        <p className="mb-4 text-sm text-hearth-200/70">
          As often as you like. An adventure played twice is a different story both times — the
          storyteller improvises everything that actually happens.
        </p>

        <ul className="divide-y divide-hearth-800/50">
          {included.map((storyline) => (
            <li key={storyline.id} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-hearth-100">{storyline.title}</span>
                {storyline.householdId === actor.householdId ? (
                  <span className="rounded-full border border-moss-700/50 bg-moss-900/20 px-2 py-0.5 text-xs text-moss-400">
                    yours
                  </span>
                ) : null}
                <span className="text-xs text-hearth-500">
                  {TONE_LABELS[storyline.defaultTone] ?? storyline.defaultTone} ·{" "}
                  {READING_LEVEL_LABELS[storyline.readingLevel] ?? storyline.readingLevel} ·{" "}
                  {storyline._count.acts} chapters
                </span>
              </div>
              <p className="mt-1 text-sm text-hearth-200/70 italic">{storyline.tagline}</p>
            </li>
          ))}
        </ul>
      </Card>

      {locked.length > 0 ? (
        <Card className="mb-6 border-hearth-700/50">
          <h2 className="font-display mb-1 text-xl text-hearth-100">
            With a larger plan <span className="text-base text-hearth-400">({locked.length})</span>
          </h2>
          <p className="mb-4 text-sm text-hearth-200/70">
            Shown rather than hidden, so you can tell whether it is worth it.
          </p>

          <ul className="divide-y divide-hearth-800/50">
            {locked.map((storyline) => (
              <li key={storyline.id} className="py-3 opacity-70">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-hearth-100">{storyline.title}</span>
                  <span className="text-xs text-hearth-500">
                    {TONE_LABELS[storyline.defaultTone] ?? storyline.defaultTone} ·{" "}
                    {storyline._count.acts} chapters
                  </span>
                </div>
                <p className="mt-1 text-sm text-hearth-200/70 italic">{storyline.tagline}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---- Writing your own ------------------------------------------- */}

      <Card className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-hearth-100">Write your own</h2>
          {entitlements.writeAdventures ? (
            <span className="text-sm text-moss-400">included</span>
          ) : (
            <span className="text-sm text-hearth-400">with a larger plan</span>
          )}
        </div>

        <p className="mt-2 text-sm text-hearth-200/70">
          A story about your own street, with your own cat in it, and the ending your daughter
          argued for. Start from a copy of one you have already played and change it, or write one
          from nothing — the storyteller improvises the rest of it at the table.
        </p>

        <p className="mt-2 text-sm text-hearth-200/60">
          This is the part a machine is actually good for. Everything else here is a library; this
          is the one thing you cannot buy off a shelf.
        </p>

        {entitlements.writeAdventures ? (
          <p className="mt-4">
            <Link
              href="/settings/adventures"
              className="inline-block rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-100 hover:border-hearth-600"
            >
              {ownAdventures > 0
                ? `Your adventures (${ownAdventures})`
                : "Write one"}
            </Link>
          </p>
        ) : null}
      </Card>

      {/* ---- Upgrading --------------------------------------------------- */}

      {unmetered ? (
        <Card>
          <p className="text-sm text-hearth-300">
            This family has everything already — nothing is counted, capped or held back.
          </p>
        </Card>
      ) : !selling ? (
        <Card>
          <p className="text-sm text-hearth-300">
            This copy of Hearthlight does not sell subscriptions. Whoever runs it decides what each
            family may do, so ask them rather than paying anybody.
          </p>
        </Card>
      ) : (
        <>
          <h2 className="font-display mb-4 text-xl text-hearth-100">Move up</h2>

          {!isOwner ? (
            <div className="mb-4">
              <Alert>
                Only whoever answers for this family can change the plan. Here is what is in each,
                so you know what to ask them for.
              </Alert>
            </div>
          ) : null}

          <div className="space-y-4">
            {upgrades.map((plan) => (
              <Card key={plan}>
                <h3 className="font-display text-lg text-hearth-100">{PLAN_NAMES[plan] ?? plan}</h3>
                <p className="mt-1 text-sm text-hearth-200/70">{PLAN_BLURBS[plan] ?? ""}</p>

                <ul className="mt-3 space-y-1 text-sm text-hearth-200/80">
                  {allowanceLines(plan).map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>

                {/* The price lives on Stripe's page. Two places for a number
                    that changes is one place that will be wrong, and the one
                    people act on is the checkout. */}
                {isOwner ? <BuyPlan plan={plan} label={`Choose ${PLAN_NAMES[plan] ?? plan}`} /> : null}
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 text-sm text-hearth-400">
        Moving to a smaller plan never takes anything away. Your adventurers, your chronicle and
        every adventure you have written stay exactly where they are — a plan decides what you can
        start next, and nothing else.
      </p>
    </main>
  );
}
