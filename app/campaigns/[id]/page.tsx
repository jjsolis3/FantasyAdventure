import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { deleteCampaignAction } from "@/lib/game/campaign-actions";
import { leaveCampaignAction } from "@/lib/game/party-actions";
import { memberCampaignFilter } from "@/lib/game/access";
import { Alert, Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CampaignSettingsForm, PartyEditor } from "@/components/campaign/campaign-settings";
import { JoinCode } from "@/components/campaign/join-code";
import {
  CAMPAIGN_STATUS_LABELS,
  INPUT_MODE_LABELS,
  READING_LEVEL_LABELS,
  TONE_LABELS,
} from "@/components/campaign/options";
import { STATS, STAT_INFO, RELATIONSHIP_LABELS, kindFromPerspective } from "@/lib/game/rules";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    include: {
      owner: { select: { displayName: true } },
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            include: {
              user: { select: { id: true, displayName: true } },
              skills: { orderBy: { name: "asc" } },
              relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
              relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!campaign) notFound();

  const isOwner = campaign.ownerId === user.id;
  const yourMembers = campaign.party.filter((member) => member.character.userId === user.id);
  const households = new Set(campaign.party.map((member) => member.character.userId)).size;

  const characters = await db.character.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, race: true, archetype: true, ageBand: true },
    orderBy: { createdAt: "asc" },
  });

  const partyIds = campaign.party.map((member) => member.characterId);
  const inParty = new Set(partyIds);

  // Bonds that exist between two characters who are both travelling. Ties to
  // someone left at home are real but cannot come up in this adventure.
  const bonds = campaign.party.flatMap((member) =>
    [...member.character.relationshipsA, ...member.character.relationshipsB]
      .map((row) => {
        const other = "characterB" in row ? row.characterB : row.characterA;
        return {
          key: row.id,
          from: member.character.name,
          to: other.name,
          otherId: other.id,
          kind: kindFromPerspective(row, member.characterId),
          bondLevel: row.bondLevel,
        };
      })
      // Each pair appears from both sides; keep one.
      .filter((bond) => inParty.has(bond.otherId) && member.characterId < bond.otherId),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
        title={campaign.title}
        lead={`${campaign.storyline.title} · ${TONE_LABELS[campaign.tone]} · ${READING_LEVEL_LABELS[campaign.readingLevel]} · ${INPUT_MODE_LABELS[campaign.inputMode]}`}
      />

      {isOwner ? null : (
        <div className="mb-6">
          <Alert tone="info">
            {campaign.owner.displayName} is running this adventure. You can play it, see everyone&rsquo;s
            character sheets and follow the story — the settings and the party stay with them.
          </Alert>
        </div>
      )}

      <div className="mb-6">
        <Link href="/campaigns" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← All adventures
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="font-display mb-3 text-xl text-hearth-100">How it begins</h2>
          <p className="leading-relaxed text-hearth-200/80">{campaign.storyline.hook}</p>

          <h3 className="mt-6 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
            The shape of it
          </h3>
          <ol className="space-y-2">
            {campaign.storyline.acts.map((act) => (
              <li key={act.id} className="flex gap-3 text-sm">
                <span
                  className={`shrink-0 ${
                    act.index === campaign.currentActIndex ? "text-hearth-300" : "text-hearth-500"
                  }`}
                >
                  {act.index}.
                </span>
                <span className={act.index === campaign.currentActIndex ? "text-hearth-200" : "text-hearth-400"}>
                  {act.title}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-hearth-500">
            A rough shape, not a script — the storyteller will follow wherever you go.
          </p>
        </Card>

        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">The party</h2>

          {campaign.party.length === 0 ? (
            <p className="text-sm text-hearth-400">Nobody chosen yet.</p>
          ) : (
            <ul className="space-y-3">
              {campaign.party.map((member, index) => (
                <li key={member.id} className="rounded-lg border border-hearth-800/60 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-hearth-500">{index + 1}.</span>
                    <Link
                      href={`/characters/${member.characterId}`}
                      className="text-hearth-100 hover:text-hearth-50"
                    >
                      {member.character.name}
                    </Link>
                    <span className="text-sm text-hearth-400">
                      {member.character.race} {member.character.archetype} · level {member.character.level}
                    </span>
                    {households > 1 ? (
                      <span className="rounded-full border border-hearth-700/50 bg-hearth-800/40 px-2 py-0.5 text-xs text-hearth-300">
                        {member.character.userId === user.id
                          ? "yours"
                          : member.character.user.displayName}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {STATS.map((stat) => (
                      <span key={stat} className="text-sm text-hearth-300">
                        <span className="text-hearth-400">{STAT_INFO[stat].label}</span>{" "}
                        {member.character[stat]}
                      </span>
                    ))}
                  </div>
                  {member.character.skills.length > 0 ? (
                    <p className="mt-2 text-sm text-hearth-200/60">
                      {member.character.skills.map((skill) => skill.name).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {bonds.length > 0 ? (
            <>
              <h3 className="mt-6 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                Bonds travelling with them
              </h3>
              <ul className="space-y-1">
                {bonds.map((bond) => (
                  <li key={bond.key} className="text-sm text-hearth-200/70">
                    {bond.from} is the {RELATIONSHIP_LABELS[bond.kind]} {bond.to}
                    <span className="text-hearth-400"> · bond {bond.bondLevel}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>

        <Card>
          {campaign.party.length === 0 ? (
            <Alert tone="info">Choose a party below before the adventure can begin.</Alert>
          ) : (
            <>
              <h2 className="font-display mb-2 text-xl text-hearth-100">
                {campaign.status === "SETUP" ? "Ready when you are" : "Pick up where you left off"}
              </h2>
              <p className="mb-4 text-sm text-hearth-400">
                {campaign.status !== "SETUP"
                  ? `${campaign.turnCounter} ${campaign.turnCounter === 1 ? "turn" : "turns"} so far.`
                  : campaign.inputMode === "OWN_DEVICE"
                    ? "Everyone opens this adventure on their own device. The storyteller sets the scene, then waits for all of you to say what you are doing before the story moves."
                    : "Gather everyone round one screen. The storyteller will set the scene, then ask each of you in turn."}
              </p>
              <Link
                href={`/campaigns/${campaign.id}/play`}
                className="inline-block rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
              >
                {campaign.status === "SETUP" ? "Begin the adventure" : "Continue the adventure"}
              </Link>
            </>
          )}
        </Card>

        {campaign.status === "COMPLETE" ? null : (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Bring somebody else in</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Anyone with their own sign-in can use this code to add one of their adventurers to the
              party. They will see the same story you do, and answer for their own character.
              {campaign.status === "SETUP"
                ? ""
                : " Joining now means arriving part-way through — the storyteller will introduce them."}
            </p>
            <JoinCode campaignId={campaign.id} code={campaign.joinCode} isOwner={isOwner} />
          </Card>
        )}

        {isOwner && campaign.status === "SETUP" ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Change the party</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Your own adventurers, and who is coming. Anyone who joined with the code keeps their
              place. Once the adventure begins the party is settled, so that the story never refers
              to someone who is no longer there.
            </p>
            <PartyEditor
              campaignId={campaign.id}
              characters={characters}
              initialPartyIds={partyIds.filter((characterId) =>
                yourMembers.some((member) => member.characterId === characterId),
              )}
              minPlayers={campaign.storyline.minPlayers}
              maxPlayers={campaign.storyline.maxPlayers}
            />
          </Card>
        ) : null}

        {isOwner ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">Settings</h2>
            <CampaignSettingsForm
              campaignId={campaign.id}
              title={campaign.title}
              tone={campaign.tone}
              readingLevel={campaign.readingLevel}
              pacing={campaign.pacing}
              inputMode={campaign.inputMode}
            />
          </Card>
        ) : null}

        {isOwner ? (
          <Card className="border-red-900/40">
            <h2 className="font-display mb-2 text-xl text-hearth-100">Remove</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Deletes this adventure, for everybody in it. The adventurers themselves are kept.
            </p>
            <form action={deleteCampaignAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <SubmitButton variant="danger" pendingLabel="Removing…">Remove this adventure</SubmitButton>
            </form>
          </Card>
        ) : campaign.status === "SETUP" ? (
          <Card className="border-red-900/40">
            <h2 className="font-display mb-2 text-xl text-hearth-100">Leave</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Takes {yourMembers.length === 1 ? "your adventurer" : "your adventurers"} back out of
              this party. Only until it begins — after that the story has already met them.
            </p>
            <form action={leaveCampaignAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <SubmitButton variant="danger" pendingLabel="Leaving…">Leave this adventure</SubmitButton>
            </form>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
