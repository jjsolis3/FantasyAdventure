import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { deleteCampaignAction } from "@/lib/game/campaign-actions";
import { Alert, Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CampaignSettingsForm, PartyEditor } from "@/components/campaign/campaign-settings";
import { CAMPAIGN_STATUS_LABELS, READING_LEVEL_LABELS, TONE_LABELS } from "@/components/campaign/options";
import { STATS, STAT_INFO, RELATIONSHIP_LABELS, kindFromPerspective } from "@/lib/game/rules";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: { id, ownerId: user.id },
    include: {
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            include: {
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
        lead={`${campaign.storyline.title} · ${TONE_LABELS[campaign.tone]} · ${READING_LEVEL_LABELS[campaign.readingLevel]}`}
      />

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
          <Alert tone="info">
            The storyteller arrives in the next milestone. Everything here is saved and waiting —
            when the Game Master engine lands, this adventure will begin from the hook above.
          </Alert>
        </Card>

        {campaign.status === "SETUP" ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Change the party</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Once the adventure begins the party is settled, so that the story never refers to
              someone who is no longer there.
            </p>
            <PartyEditor
              campaignId={campaign.id}
              characters={characters}
              initialPartyIds={partyIds}
              minPlayers={campaign.storyline.minPlayers}
              maxPlayers={campaign.storyline.maxPlayers}
            />
          </Card>
        ) : null}

        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">Settings</h2>
          <CampaignSettingsForm
            campaignId={campaign.id}
            title={campaign.title}
            tone={campaign.tone}
            readingLevel={campaign.readingLevel}
          />
        </Card>

        <Card className="border-red-900/40">
          <h2 className="font-display mb-2 text-xl text-hearth-100">Remove</h2>
          <p className="mb-4 text-sm text-hearth-400">
            Deletes this adventure. The adventurers themselves are kept.
          </p>
          <form action={deleteCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <SubmitButton variant="danger" pendingLabel="Removing…">Remove this adventure</SubmitButton>
          </form>
        </Card>
      </div>
    </main>
  );
}
