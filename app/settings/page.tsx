import Link from "next/link";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { householdUsage } from "@/lib/billing/usage";
import { UNLIMITED, describeAllowance } from "@/lib/billing/plans";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = {
  HEARTH: "Hearth",
  HOMESTEAD: "Homestead",
  KEEP: "Keep",
  UNMETERED: "Unmetered",
};

/**
 * What this family has, and how much of it is left.
 *
 * Shown to a household even on a self-hosted installation where nothing is
 * capped, because "you are not being limited" is a useful thing to be able to
 * read — and because a family that later *is* on a plan should find this in the
 * place it has always been rather than discovering it the first time something
 * is refused.
 *
 * An unmetered household is told so in one line and shown no bars. A row of
 * gauges that are always empty is worse than nothing: it invites a family to
 * worry about a ceiling that is not there.
 */
function PlanCard({ usage }: { usage: Awaited<ReturnType<typeof householdUsage>> }) {
  const { entitlements } = usage;
  const unmetered = entitlements.turnsPerMonth >= UNLIMITED;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-hearth-100">
          {PLAN_NAMES[entitlements.plan] ?? entitlements.plan}
        </h2>
        {entitlements.status === "ACTIVE" ? null : (
          <span className="text-sm text-amber-300">{entitlements.status.toLowerCase()}</span>
        )}
      </div>

      {unmetered ? (
        <p className="mt-2 text-sm text-hearth-200/70">
          Nothing here is counted or capped — play as much as you like.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1.5 text-sm text-hearth-200/80 sm:grid-cols-2">
          <li>{describeAllowance(usage.turns, entitlements.turnsPerMonth)} turns this month</li>
          <li>{describeAllowance(usage.campaigns, entitlements.campaigns)} adventures on the go</li>
          <li>{describeAllowance(usage.seatsTaken, entitlements.seats)} places in the family</li>
          <li>
            {describeAllowance(usage.links, entitlements.linkedHouseholds)} families you adventure
            with
          </li>
        </ul>
      )}

      {entitlements.status === "PAST_DUE" ? (
        <p className="mt-3 text-sm text-amber-200/90">
          There is a problem with the payment. Adventures already under way carry on as normal —
          nothing new can be started until it is sorted out.
        </p>
      ) : null}
      {entitlements.status === "CANCELED" ? (
        <p className="mt-3 text-sm text-amber-200/90">
          This subscription has ended. Everything you have written is still here and still yours to
          read.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * One door for everything that belongs to a family.
 *
 * `/settings` used to be the operator's screen, holding the storyteller's API
 * key and a list of every adventurer in the installation. That worked while one
 * person was both the administrator and the only parent. It stopped working the
 * moment a second family was invited: the two jobs are not the same job, and a
 * parent who is handed the second must not thereby be handed the first.
 *
 * So the installation's half moved to `/admin`, and this is the half a family
 * actually wants — its own people, and its own invitations. A platform
 * administrator sees it too, because their own family is one of them.
 */
export default async function FamilySettingsPage() {
  const actor = await requireHouseholdParent();

  const scope = actor.everywhere ? {} : { householdId: actor.householdId ?? "" };

  const [household, adventurers, unusedInvites, linkedFamilies] = await Promise.all([
    actor.householdId
      ? db.household.findUnique({
          where: { id: actor.householdId },
          select: { name: true, _count: { select: { members: true } } },
        })
      : null,
    db.character.count({ where: scope }),
    // By household, not by who happened to type it — so either parent's count
    // matches what either parent sees on the screen itself.
    db.inviteCode.count({ where: { redeemedById: null, ...scope } }),
    actor.householdId
      ? db.householdLink.count({
          where: {
            OR: [{ householdAId: actor.householdId }, { householdBId: actor.householdId }],
          },
        })
      : 0,
  ]);

  const householdSize = household?._count.members ?? 0;
  const usage = actor.householdId ? await householdUsage(actor.householdId) : null;
  const ownAdventures = actor.householdId
    ? await db.storyline.count({ where: { householdId: actor.householdId } })
    : 0;

  const cards = [
    {
      href: "/settings/adventurers",
      title: "Adventurers",
      blurb:
        "Everyone in the family, and what they have earned. Starting one again — back to level one, skills and knacks cleared — is here rather than on her own sheet, so it is always something two people agreed on.",
      note: `${adventurers} ${adventurers === 1 ? "adventurer" : "adventurers"}`,
    },
    {
      href: "/settings/invites",
      title: "Invitations",
      blurb:
        "Hearthlight is invite-only. Make a code for each person who needs their own sign-in — which is what everyone playing from their own device needs.",
      note: `${unusedInvites} unused`,
    },
    {
      href: "/settings/adventures",
      title: "Your adventures",
      blurb:
        "Write your own, or take a copy of one you have played and change the ending. Nobody outside this family can see them — not even a family you adventure with.",
      note:
        ownAdventures === 0
          ? "none yet"
          : `${ownAdventures} ${ownAdventures === 1 ? "adventure" : "adventures"}`,
    },
    {
      href: "/settings/people",
      title: "Your family",
      blurb:
        "Everybody with a sign-in of their own. This is also where you help somebody who has forgotten their password — a child has no email address to send a reset to, so you set a new one and tell her.",
      note: `${householdSize} ${householdSize === 1 ? "person" : "people"}`,
    },
    {
      href: "/settings/families",
      title: "Families you adventure with",
      blurb:
        "Swap codes with another family and your two sets of adventurers can travel together. Until you do, neither family can see the other's — which is the point.",
      note:
        linkedFamilies === 0
          ? "none yet"
          : `${linkedFamilies} ${linkedFamilies === 1 ? "family" : "families"}`,
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={household?.name ?? "Your household"}
        title="Settings"
        lead="The parts of this that belong to your family rather than to whoever runs the server."
      />

      {actor.everywhere ? (
        <p className="mb-8 text-sm text-hearth-300/80">
          You also run this installation.{" "}
          <Link href="/admin" className="text-hearth-400 underline hover:text-hearth-200">
            Administration
          </Link>{" "}
          is where the storyteller, the adventure library and the households live.
        </p>
      ) : null}

      {usage ? (
        <Link href="/settings/billing" className="block">
          <div className="transition-opacity hover:opacity-90">
            <PlanCard usage={usage} />
          </div>
        </Link>
      ) : null}

      <div className="space-y-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="block">
            <Card className="transition-colors hover:border-hearth-700">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg text-hearth-100">{card.title}</h2>
                {card.note ? (
                  <span className="text-sm text-hearth-400 tabular-nums">{card.note}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-hearth-200/70">{card.blurb}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
