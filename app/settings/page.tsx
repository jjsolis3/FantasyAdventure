import Link from "next/link";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

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
