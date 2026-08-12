import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * One door for everything only an administrator touches.
 *
 * These had grown up in three unrelated places — invites in the header,
 * the storyteller under its own path, and nothing at all for the rest — which
 * is fine while there are two of them and confusing at four. Each card says
 * what the page is *for* rather than what it is called, since the person
 * arriving here is usually looking for an outcome.
 */
export default async function SettingsHubPage() {
  await requireAdmin();

  const [storylines, custom, campaigns, calls, unusedInvites, adventurers] = await Promise.all([
    db.storyline.count(),
    db.storyline.count({ where: { isCustom: true } }),
    db.campaign.count(),
    db.aiCall.count(),
    db.inviteCode.count({ where: { redeemedById: null } }),
    db.character.count(),
  ]);

  const cards = [
    {
      href: "/settings/storyteller",
      title: "The storyteller",
      blurb:
        "Which model tells the story, where to reach it, and whether chapters get pictures. Test it here before a session rather than during one.",
      note: null,
    },
    {
      href: "/settings/adventures",
      title: "Adventures",
      blurb:
        "Write your own, or edit one of the ones that came with the game. Premise, opening, chapters, and what there is to find.",
      note: `${storylines} in the library${custom > 0 ? `, ${custom} of them yours` : ""}`,
    },
    {
      href: "/settings/usage",
      title: "What it has used",
      blurb:
        "Every call the storyteller has made, what it cost, and what it actually said — which is the only way to find out why one turn came out strange.",
      note: `${calls} ${calls === 1 ? "call" : "calls"} across ${campaigns} ${
        campaigns === 1 ? "adventure" : "adventures"
      }`,
    },
    {
      href: "/settings/adventurers",
      title: "Adventurers",
      blurb:
        "Everyone in the house, and what they have earned. Starting one again — back to level one, skills and knacks cleared — is here rather than on her own sheet, so it is always something two people agreed on.",
      note: `${adventurers} across every household`,
    },
    {
      href: "/invites",
      title: "Invitations",
      blurb:
        "Registration is invite-only. Make a code for each person who needs their own sign-in — which is what everyone playing from their own device needs.",
      note: `${unusedInvites} unused`,
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
