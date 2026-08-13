import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { deleteCampaignAction } from "@/lib/game/campaign-actions";
import { leaveCampaignAction } from "@/lib/game/party-actions";
import { memberCampaignFilter } from "@/lib/game/access";
import { invitableCharacters } from "@/lib/game/invites";
import { cancelInviteAction, inviteCharacterAction } from "@/lib/game/invite-actions";
import { Alert, Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CampaignSettingsForm, PartyEditor } from "@/components/campaign/campaign-settings";
import { JoinCode } from "@/components/campaign/join-code";
import { SendToScreen } from "@/components/campaign/send-to-screen";
import { screensFor } from "@/lib/game/screen";
import { Packing, type Packer } from "@/components/campaign/packing";
import { SUPPLIES_PER_CHARACTER } from "@/lib/game/loadout";
import { extraSupplies } from "@/lib/game/knacks";
import { TableControls } from "@/components/campaign/table-controls";
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
              inventory: { orderBy: { name: "asc" } },
              knacks: { select: { key: true } },
              relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
              relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      invites: {
        where: { status: { in: ["PENDING", "DECLINED"] } },
        orderBy: { createdAt: "asc" },
        include: {
          character: {
            select: { id: true, name: true, user: { select: { displayName: true } } },
          },
        },
      },
    },
  });
  if (!campaign) notFound();

  const isOwner = campaign.ownerId === user.id;
  // Only the owner can pair or unpair, so only the owner is shown the list.
  const screens = isOwner ? await screensFor(campaign.id) : [];
  const yourMembers = campaign.party.filter((member) => member.character.userId === user.id);
  const households = new Set(campaign.party.map((member) => member.character.userId)).size;

  const characters = await db.character.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, race: true, archetype: true, ageBand: true },
    orderBy: { createdAt: "asc" },
  });

  const partyIds = campaign.party.map((member) => member.characterId);
  const inParty = new Set(partyIds);

  const pendingInvites = campaign.invites.filter((invite) => invite.status === "PENDING");
  const declinedInvites = campaign.invites.filter((invite) => invite.status === "DECLINED");

  // Everybody travelling, with whatever they have packed so far. Somebody
  // else's adventurer still appears — seeing that your sister has taken the
  // lantern is how you decide not to — but only as a line of text.
  const packers: Packer[] = campaign.party.map((member) => ({
    characterId: member.characterId,
    name: member.character.name,
    archetype: member.character.archetype,
    tone: campaign.tone,
    packed: member.character.inventory
      .filter((item) => item.brought && item.foundInCampaignId === campaign.id)
      .map((item) => item.name),
    // Everything else she owns — found or packed on an earlier adventure, and
    // still in her pockets. She keeps it whatever she chooses here.
    carried: member.character.inventory
      .filter((item) => !(item.brought && item.foundInCampaignId === campaign.id))
      .map((item) => item.name),
    allowance:
      SUPPLIES_PER_CHARACTER + extraSupplies(member.character.knacks.map((knack) => knack.key)),
    yours: isOwner || member.character.userId === user.id,
  }));

  const shortOfMinimum = campaign.party.length < campaign.storyline.minPlayers;
  const roomLeft = campaign.storyline.maxPlayers - campaign.party.length - pendingInvites.length;

  // Only the owner sends invitations, and only while the story has not started.
  const canInvite = isOwner && campaign.status === "SETUP" && roomLeft > 0;
  const invitable = canInvite
    ? await invitableCharacters(user.id, {
        exclude: [...partyIds, ...pendingInvites.map((invite) => invite.characterId)],
      })
    : [];

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
          ) : campaign.status === "SETUP" && shortOfMinimum ? (
            <>
              <h2 className="font-display mb-2 text-xl text-hearth-100">
                {pendingInvites.length > 0 ? "Waiting on the others" : "Not enough adventurers yet"}
              </h2>
              <p className="mb-4 text-sm text-hearth-400">
                {pendingInvites.length > 0
                  ? `${campaign.storyline.title} needs ${campaign.storyline.minPlayers} adventurers, and ${pendingInvites
                      .map((invite) => invite.character.name)
                      .join(", ")} ${pendingInvites.length === 1 ? "has" : "have"} been asked. The adventure begins as soon as ${pendingInvites.length === 1 ? "they say" : "they all say"} yes — nothing is lost while you wait.`
                  : `${campaign.storyline.title} needs ${campaign.storyline.minPlayers} adventurers and the party has ${campaign.party.length}. Invite somebody, or share the code below.`}
              </p>
              {pendingInvites.length > 0 ? (
                <p className="text-sm text-hearth-500">
                  Whoever plays them will see the invitation on their own adventures page.
                </p>
              ) : null}
            </>
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
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/campaigns/${campaign.id}/play`}
                  className="inline-block rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
                >
                  {campaign.status === "SETUP" ? "Begin the adventure" : "Continue the adventure"}
                </Link>
                {campaign.status === "SETUP" ? null : (
                  <Link
                    href={`/campaigns/${campaign.id}/summary`}
                    className="inline-block rounded-lg border border-hearth-700 px-5 py-2.5 text-hearth-200 transition-colors hover:bg-hearth-800/50"
                  >
                    {campaign.status === "COMPLETE" ? "How it went" : "How it is going"}
                  </Link>
                )}
                {campaign.status === "SETUP" ? null : (
                  <Link
                    href={`/campaigns/${campaign.id}/journal`}
                    className="inline-block rounded-lg border border-hearth-700 px-5 py-2.5 font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
                  >
                    Read the journal
                  </Link>
                )}
                {/* The quest board had no door from here at all: it was reachable
                    from the table and from the journal, and not from the page
                    that is otherwise the front of an adventure. */}
                {/* Reachable from setup onward, unlike the others: a family
                    can draw the people from an adventure they have not begun,
                    and often will, because the drawing is half the fun. */}
                <Link
                  href={`/campaigns/${campaign.id}/pictures`}
                  className="inline-block rounded-lg border border-hearth-700 px-5 py-2.5 font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
                >
                  Pictures
                </Link>
                {campaign.status === "SETUP" ? null : (
                  <Link
                    href={`/campaigns/${campaign.id}/finds`}
                    className="inline-block rounded-lg border border-hearth-700 px-5 py-2.5 font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
                  >
                    The quest board
                  </Link>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Packing, while the adventure is still being prepared. Placed above
            the party editor because it is the thing to do next once everybody
            has agreed to come, and it stops being offered the moment the story
            starts — things arrive by being found after that. */}
        {campaign.status === "SETUP" && packers.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">What are you bringing?</h2>
            <p className="mb-5 text-sm text-hearth-400">
              Two things each, packed before you set out. Nothing here is better than anything else
              and none of it is scarce — but you cannot take everything, and what you brought is
              what you will have. Change your minds as often as you like until the story starts.
            </p>
            <Packing campaignId={campaign.id} packers={packers} />
          </Card>
        ) : null}

        {isOwner && (pendingInvites.length > 0 || declinedInvites.length > 0 || canInvite) ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Ask somebody along</h2>
            <p className="mb-4 text-sm text-hearth-400">
              An invitation goes to whoever plays that adventurer. They answer for themselves, and
              the adventure waits for them — nobody has to hand a character over to play together.
            </p>

            {pendingInvites.length > 0 ? (
              <ul className="mb-5 space-y-2">
                {pendingInvites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-hearth-800/60 p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-hearth-100">{invite.character.name}</span>
                      <span className="block text-sm text-hearth-400">
                        asked · played by {invite.character.user.displayName}
                      </span>
                    </span>
                    <form action={cancelInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button
                        type="submit"
                        aria-label={`Take back the invitation to ${invite.character.name}`}
                        className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-300 transition-colors hover:bg-hearth-800/50"
                      >
                        Take it back
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}

            {declinedInvites.length > 0 ? (
              <p className="mb-5 text-sm text-hearth-400">
                {declinedInvites.map((invite) => invite.character.name).join(", ")} cannot come this
                time. You can ask again below.
              </p>
            ) : null}

            {canInvite ? (
              invitable.length === 0 ? (
                <p className="text-sm text-hearth-400">
                  Nobody else has an adventurer yet. The code below works for anyone who makes one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {invitable.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-hearth-800/60 p-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-hearth-100">{candidate.name}</span>
                        <span className="block text-sm text-hearth-400">
                          {candidate.race} {candidate.archetype} · played by {candidate.playedBy}
                        </span>
                        {candidate.tie ? (
                          <span className="mt-0.5 block text-sm text-moss-400">{candidate.tie}</span>
                        ) : null}
                      </span>
                      <form action={inviteCharacterAction}>
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <input type="hidden" name="characterId" value={candidate.id} />
                        <button
                          type="submit"
                          aria-label={`Invite ${candidate.name}`}
                          className="rounded-lg bg-hearth-600 px-3 py-1.5 text-sm font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
                        >
                          Invite
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )
            ) : isOwner && campaign.status === "SETUP" ? (
              <p className="text-sm text-hearth-400">
                The party is as large as {campaign.storyline.title} takes.
              </p>
            ) : null}
          </Card>
        ) : null}

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

        {isOwner ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">On the big screen</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Put the story on a television so everyone can see the pictures and read the same
              paragraph at once. The screen only ever shows — nobody can play from it, and each
              girl&rsquo;s own aim stays on her own phone.
            </p>
            <SendToScreen campaignId={campaign.id} initialScreens={screens} />
          </Card>
        ) : null}

        {isOwner && campaign.party.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Run the table</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Yours to arrange: who is in the party, the order they are heard in, and whether the
              adventure is going on at all.
            </p>
            <TableControls
              campaignId={campaign.id}
              status={campaign.status}
              members={campaign.party.map((member) => ({
                characterId: member.characterId,
                name: member.character.name,
                race: member.character.race,
                archetype: member.character.archetype,
                playedBy: member.character.user.displayName,
                yours: member.character.userId === user.id,
              }))}
            />
          </Card>
        ) : null}

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
