import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { memberCampaignWhere } from "@/lib/game/access";
import { pendingInvitesFor } from "@/lib/game/invites";
import { respondToInviteAction } from "@/lib/game/invite-actions";
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

  const [characterCount, invites] = await Promise.all([
    db.character.count({ where: { userId: user.id } }),
    pendingInvitesFor(user.id),
  ]);

  // Which adventures are waiting on *this* player. Somebody who opens the app
  // between school runs should not have to go into each one to find out whether
  // anybody is waiting for them.
  const openRounds = await db.turnRound.findMany({
    where: { campaignId: { in: campaigns.map((campaign) => campaign.id) }, status: "COLLECTING" },
    select: { campaignId: true, answers: { select: { characterId: true } } },
  });

  const waitingOn = new Set(
    openRounds
      .filter((round) => {
        const campaign = campaigns.find((entry) => entry.id === round.campaignId);
        if (!campaign || campaign.inputMode !== "OWN_DEVICE") return false;

        const answered = new Set(round.answers.map((answer) => answer.characterId));
        return campaign.party.some(
          (member) => member.character.userId === user.id && !answered.has(member.characterId),
        );
      })
      .map((round) => round.campaignId),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your table"
        title="Adventures"
        lead="Each adventure remembers its own party, its own tone, and everything that has happened so far."
      />

      {invites.length > 0 ? (
        <div className="mb-6 space-y-3">
          {invites.map((invite) => (
            <Card key={invite.id} className="border-moss-700/50 bg-moss-900/10">
              <h2 className="font-display text-lg text-hearth-100">
                {invite.invitedBy} has asked {invite.characterName} along
              </h2>
              <p className="mt-1 text-sm text-hearth-300">
                {invite.campaignTitle} · {invite.storylineTitle}
              </p>
              <p className="mt-2 text-sm text-hearth-400">
                {invite.stale
                  ? "That adventure has already finished."
                  : "It will not begin until you answer. Say yes and you will see the same story they do, answering for your own adventurer."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {invite.stale ? null : (
                  <form action={respondToInviteAction}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <input type="hidden" name="answer" value="accept" />
                    <SubmitButton pendingLabel="Joining…">
                      Yes, {invite.characterName} is coming
                    </SubmitButton>
                  </form>
                )}
                <form action={respondToInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <input type="hidden" name="answer" value="decline" />
                  <SubmitButton variant="secondary" pendingLabel="Declining…">
                    Not this time
                  </SubmitButton>
                </form>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

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

      {campaigns.length === 0 && characterCount > 0 ? (
        // Reached often enough to be worth writing: everybody's second visit,
        // after building a family and before starting anything. Rendering
        // nothing left a heading floating above blank space, which reads as a
        // page that failed to load rather than one with nothing on it yet.
        <Card>
          <p className="text-hearth-200/70">
            No adventures yet. Starting one takes a minute: pick a story, choose who is coming, and
            the storyteller does the rest.
          </p>
        </Card>
      ) : null}

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
                  {waitingOn.has(campaign.id) ? (
                    <span className="rounded-full border border-hearth-500/60 bg-hearth-700/50 px-2.5 py-0.5 text-xs font-medium text-hearth-100">
                      Your turn
                    </span>
                  ) : null}
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
