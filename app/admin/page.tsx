import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * One door for everything that belongs to whoever runs this installation.
 *
 * This used to be `/settings`, and it used to hold both jobs at once: the
 * storyteller's API key sat on the same page as "your adventurers". That was
 * one person's screen while one family played. It is two people's screens now,
 * and a parent should never be looking at a model provider's credentials — so
 * the family's half moved to `/settings` and this is what is left.
 *
 * Each card says what the page is *for* rather than what it is called, since
 * the person arriving here is usually looking for an outcome.
 */
export default async function AdminHubPage() {
  await requirePlatformAdmin();

  const [storylines, custom, campaigns, calls, households, waiting] = await Promise.all([
    db.storyline.count(),
    db.storyline.count({ where: { isCustom: true } }),
    db.campaign.count(),
    db.aiCall.count(),
    db.household.count(),
    db.inviteCode.count({ where: { redeemedById: null } }),
  ]);

  const cards = [
    {
      href: "/admin/invites",
      title: "Invitations",
      blurb:
        "Admitting a new family, which is the one thing no family can do for itself — and inviting somebody into a household that cannot manage it, when a parent has locked themselves out.",
      note: `${waiting} ${waiting === 1 ? "code" : "codes"} waiting to be used`,
    },
    {
      href: "/admin/storyteller",
      title: "The storyteller",
      blurb:
        "Which model tells the story, where to reach it, and whether chapters get pictures. Test it here before a session rather than during one.",
      note: null,
    },
    {
      href: "/admin/adventures",
      title: "Adventures",
      blurb:
        "Write your own, or edit one of the ones that came with the game. Premise, opening, chapters, and what there is to find.",
      note: `${storylines} in the library${custom > 0 ? `, ${custom} of them yours` : ""}`,
    },
    {
      href: "/admin/usage",
      title: "What it has used",
      blurb:
        "Every call the storyteller has made, what it cost, and what it actually said — which is the only way to find out why one turn came out strange.",
      note: `${calls} ${calls === 1 ? "call" : "calls"} across ${campaigns} ${
        campaigns === 1 ? "adventure" : "adventures"
      }`,
    },
    {
      href: "/admin/households",
      title: "Households",
      blurb:
        "Which accounts are one family. Everything private in this app is scoped to these — an adventurer belongs to a household, and only that household and the ones it has agreed to adventure with can see her.",
      note: `${households} ${households === 1 ? "household" : "households"}`,
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Administrator"
        title="Settings"
        lead="The parts of this that belong to whoever runs it rather than to whoever is playing."
      />

      <div className="space-y-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="block">
            <Card className="transition-colors hover:border-hearth-700">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-display text-xl text-hearth-100">{card.title}</h2>
                {card.note ? <span className="text-sm text-hearth-500">{card.note}</span> : null}
              </div>
              <p className="mt-2 text-sm text-hearth-200/70">{card.blurb}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
