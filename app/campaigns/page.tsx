import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { memberCampaignWhere } from "@/lib/game/access";
import {
  CAMPAIGN_STATUS_LABELS,
  INPUT_MODE_LABELS,
  READING_LEVEL_LABELS,
  TONE_LABELS,
} from "@/components/campaign/options";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await requireUser();

  const campaigns = await db.campaign.findMany({
    where: memberCampaignWhere(user.id),
    include: {
      owner: { select: { displayName: true } },
      storyline: { select: { title: true, estimatedScenes: true } },
      party: {
        include: { character: { select: { name: true, userId: true } } },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ lastPlayedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  const characterCount = await db.character.count({ where: { userId: user.id } });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your table"
        title="Adventures"
        lead="Each adventure remembers its own party, its own tone, and everything that has happened so far."
      />

      <div className="mb-6">
        {characterCount === 0 ? (
          <Card>
            <p className="text-hearth-200/70">
              Before an adventure can begin, somebody has to go on it.{" "}
              <Link href="/characters/new" className="text-hearth-300 underline hover:text-hearth-200">
                Build your first adventurer
              </Link>
              .
            </p>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Link
              href="/campaigns/new"
              className="inline-block rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
            >
              Start a new adventure
            </Link>
            <Link
              href="/campaigns/join"
              className="inline-block rounded-lg border border-hearth-700 px-4 py-2 font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
            >
              Join with a code
            </Link>
          </div>
        )}
      </div>

      {campaigns.length === 0 ? null : (
        <ul className="space-y-4">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card className="transition-colors hover:border-hearth-700">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="font-display text-xl text-hearth-100 hover:text-hearth-50"
                  >
                    {campaign.title}
                  </Link>
                  <span className="rounded-full border border-hearth-700/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-300">
                    {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                  </span>
                  {campaign.ownerId === user.id ? null : (
                    <span className="rounded-full border border-moss-700/50 bg-moss-900/20 px-2.5 py-0.5 text-xs text-moss-400">
                      {campaign.owner.displayName}&rsquo;s table
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-hearth-400">
                  {campaign.storyline.title} · {TONE_LABELS[campaign.tone]} ·{" "}
                  {READING_LEVEL_LABELS[campaign.readingLevel]} ·{" "}
                  {INPUT_MODE_LABELS[campaign.inputMode]}
                </p>

                <p className="mt-3 text-sm text-hearth-200/70">
                  {campaign.party.length > 0
                    ? campaign.party.map((member) => member.character.name).join(", ")
                    : "No party chosen yet"}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
