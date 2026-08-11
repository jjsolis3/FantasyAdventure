import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PlayClient } from "@/components/play/play-client";
import type { TranscriptEntry, DiceDetail } from "@/components/play/transcript";
import { STATS, STAT_INFO } from "@/lib/game/rules";
import { LevelPip } from "@/components/character/level-badge";
import type { AvailableMove } from "@/components/play/family-move-picker";
import { kindFromPerspective, movesUnlockedAt } from "@/lib/game/rules";
import { memberCampaignFilter, membershipFor } from "@/lib/game/access";
import { currentRound } from "@/lib/game/rounds";
import { questBoard } from "@/lib/game/quests";
import { QuestList, QuestSummaryLink } from "@/components/campaign/quest-list";
import { resolveImageConfig } from "@/lib/ai/settings";
import { PartySheets, type PartySheet } from "@/components/play/party-sheets";
import { ScenePicture } from "@/components/play/scene-picture";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    include: {
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            include: {
              user: { select: { id: true, displayName: true } },
              portrait: { select: { version: true } },
              skills: { orderBy: { name: "asc" } },
              inventory: { orderBy: { name: "asc" } },
              relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
              relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      scenes: { orderBy: { index: "asc" } },
    },
  });
  if (!campaign) notFound();

  const membership = await membershipFor(campaign.id, user.id);

  // Pictures are off unless a table has set up somewhere to draw them, so this
  // asks once per page rather than letting every browser find out by failing.
  const picturesOn = (await resolveImageConfig()) !== null;
  // Only OWN_DEVICE campaigns have a waiting room; a shared screen keeps its
  // answers on the page until they are sent.
  const round = campaign.inputMode === "OWN_DEVICE" ? await currentRound(campaign.id) : null;

  const openScene = campaign.scenes.find((scene) => scene.status === "OPEN");
  const hasPicture = openScene
    ? (await db.sceneImage.count({ where: { sceneId: openScene.id } })) > 0
    : false;

  // Only the current scene is replayed in full. Earlier scenes are summarised
  // and shown as a recap, which is also exactly how the Game Master sees them.
  const turns = openScene
    ? await db.turnEvent.findMany({ where: { sceneId: openScene.id }, orderBy: { ordinal: "asc" } })
    : [];

  const namesById = new Map(campaign.party.map((member) => [member.characterId, member.character.name]));

  const entries: TranscriptEntry[] = turns.map((turn) => ({
    id: turn.id,
    type: turn.type,
    actorName: turn.actorCharacterId ? namesById.get(turn.actorCharacterId) : null,
    content: turn.content,
    dice: turn.type === "DICE_ROLL" ? ((turn.metadata as unknown as DiceDetail) ?? null) : null,
    spoken: (turn.metadata as { spoken?: boolean } | null)?.spoken === true,
    bookmark: (turn.metadata as { bookmark?: boolean } | null)?.bookmark === true,
  }));

  // The metadata blob does not carry the character name; fill it from the party.
  for (const entry of entries) {
    if (entry.dice && entry.actorName) entry.dice.characterName = entry.actorName;
  }

  // Which Family Moves the party can spend right now: unlocked by bond level,
  // between two travellers, and not already used in this scene.
  const inParty = new Set(campaign.party.map((member) => member.characterId));
  const spent = openScene
    ? await db.familyMoveUse.findMany({ where: { sceneId: openScene.id } })
    : [];
  const spentKeys = new Set(spent.map((use) => `${use.relationshipId}:${use.moveKey}`));

  const availableMoves: AvailableMove[] = campaign.party.flatMap((member) =>
    [...member.character.relationshipsA, ...member.character.relationshipsB]
      .filter((row) => {
        const other = "characterB" in row ? row.characterB : row.characterA;
        // Each pair appears from both sides; take it once.
        return inParty.has(other.id) && member.characterId < other.id;
      })
      .flatMap((row) => {
        const other = "characterB" in row ? row.characterB : row.characterA;
        const helperName = member.character.name;

        // A move is between two people, and either can be the one helping.
        return movesUnlockedAt(row.bondLevel)
          .filter((move) => !spentKeys.has(`${row.id}:${move.key}`))
          .flatMap((move) => [
            {
              key: move.key,
              helperId: member.characterId,
              helperName,
              targetId: other.id,
              targetName: other.name,
            },
            {
              key: move.key,
              helperId: other.id,
              helperName: other.name,
              targetId: member.characterId,
              targetName: helperName,
            },
          ]);
      }),
  );

  // Everybody's sheet, for everybody. On separate devices there is no longer a
  // screen in the middle of the table to lean over, and a player who cannot see
  // what their character is good at has no way to decide what to try.
  const sheets: PartySheet[] = campaign.party.map((member) => ({
    id: member.characterId,
    name: member.character.name,
    race: member.character.race,
    archetype: member.character.archetype,
    pronouns: member.character.pronouns,
    description: member.character.description,
    xp: member.character.xp,
    stats: Object.fromEntries(STATS.map((stat) => [stat, member.character[stat]])) as Record<
      (typeof STATS)[number],
      number
    >,
    skills: member.character.skills.map((skill) => ({ name: skill.name, rank: skill.rank })),
    inventory: member.character.inventory.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      description: item.description,
    })),
    bonds: [...member.character.relationshipsA, ...member.character.relationshipsB]
      .map((row) => {
        const other = "characterB" in row ? row.characterB : row.characterA;
        return {
          otherId: other.id,
          otherName: other.name,
          kind: kindFromPerspective(row, member.characterId),
          bondLevel: row.bondLevel,
        };
      })
      .filter((bond) => inParty.has(bond.otherId)),
    playedBy: member.character.user.displayName,
    yours: member.character.userId === user.id,
    portraitVersion: member.character.portrait?.version ?? null,
  }));

  const quests = await questBoard(db, campaign.id, user.id);
  const openQuests = quests.filter((quest) => quest.status === "ACTIVE");

  // Everything the party is carrying from this adventure, for the tray. Kept
  // here rather than a page away: "who has the key?" is a question that comes
  // up in the middle of deciding what to do, and answering it should not mean
  // leaving the table.
  const pockets = campaign.party
    .map((member) => ({
      name: member.character.name,
      items: member.character.inventory
        .filter((item) => item.foundInCampaignId === campaign.id)
        .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)),
    }))
    .filter((entry) => entry.items.length > 0);

  const recap = campaign.scenes.filter((scene) => scene.status === "CLOSED" && scene.summary);

  // Offered only once a turn has actually been played — the snapshot is
  // written by a turn and cleared when it is used, so its presence is the
  // honest answer to "is there something to take back?".
  const canUndo = (await db.turnSnapshot.count({ where: { campaignId: campaign.id } })) > 0;
  const act = campaign.storyline.acts.find((entry) => entry.index === campaign.currentActIndex);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/campaigns/${campaign.id}`} className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← {campaign.title}
        </Link>
        {act ? (
          <p className="mt-2 text-sm tracking-[0.15em] text-hearth-400 uppercase">
            Chapter {act.index} of {campaign.storyline.acts.length} · {act.title}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-hearth-500">
          {campaign.turnCounter} {campaign.turnCounter === 1 ? "turn" : "turns"} so far ·{" "}
          {campaign.inputMode === "OWN_DEVICE"
            ? "everyone on their own device"
            : "one shared screen"}
          {" · "}
          <QuestSummaryLink campaignId={campaign.id} quests={quests} />
        </p>
      </header>

      {/* The quest board, foldable, at the table rather than a page away. Shut
          by default so it never competes with the story, and remembered open
          by the browser for a table that wants it up all evening. */}
      {openQuests.length > 0 || pockets.length > 0 ? (
        <details className="print-hide mb-6 rounded-xl border border-hearth-800/60 bg-hearth-900/20">
          <summary className="cursor-pointer px-4 py-3 text-sm text-hearth-300 hover:text-hearth-200">
            Quests and pockets
          </summary>
          <div className="space-y-5 px-4 pt-1 pb-4">
            {openQuests.length > 0 ? <QuestList quests={openQuests} compact /> : null}

            {pockets.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
                  Who is carrying what
                </h3>
                <ul className="space-y-1">
                  {pockets.map((entry) => (
                    <li key={entry.name} className="text-sm text-hearth-200/80">
                      <span className="text-hearth-100">{entry.name}</span> — {entry.items.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Link
              href={`/campaigns/${campaign.id}/finds`}
              className="inline-block text-sm text-hearth-300 underline hover:text-hearth-200"
            >
              The whole board, and handing things over →
            </Link>
          </div>
        </details>
      ) : null}

      {/* Party status bar — sticky so a ten-year-old can always see their stats,
          and offset by the height of the site header, which is sticky too. */}
      <div className="sticky top-16 z-10 -mx-6 mb-8 border-b border-hearth-800/60 bg-hearth-950/90 px-6 py-3 backdrop-blur">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {campaign.party.map((member) => (
            <li key={member.id} className="text-sm">
              <span className="text-hearth-100">{member.character.name}</span>
              <span className="ml-2 align-middle">
                <LevelPip xp={member.character.xp} />
              </span>
              <span className="ml-2 text-hearth-400">
                {STATS.map((stat) => `${STAT_INFO[stat].label[0]}${member.character[stat]}`).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {openScene ? (
        <div className="mb-8">
          <ScenePicture
            campaignId={campaign.id}
            sceneId={openScene.id}
            sceneTitle={openScene.title}
            hasImage={hasPicture}
            enabled={picturesOn}
          />
        </div>
      ) : null}

      <PartySheets sheets={sheets} />

      {recap.length > 0 ? (
        <details className="mb-8 rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-4">
          <summary className="cursor-pointer text-sm text-hearth-300">
            The story so far ({recap.length} {recap.length === 1 ? "chapter" : "chapters"})
          </summary>
          <div className="mt-3 space-y-3">
            {recap.map((scene) => (
              <div key={scene.id}>
                <p className="text-sm font-medium text-hearth-300">{scene.title}</p>
                <p className="text-sm leading-relaxed text-hearth-200/70">{scene.summary}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <PlayClient
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        status={campaign.status}
        party={campaign.party.map((member) => ({
          id: member.characterId,
          name: member.character.name,
          race: member.character.race,
          archetype: member.character.archetype,
          level: member.character.level,
          pronouns: member.character.pronouns,
          playedBy: member.character.user.displayName,
          yours: member.character.userId === user.id,
        }))}
        initialEntries={entries}
        availableMoves={availableMoves}
        canUndo={canUndo}
        inputMode={campaign.inputMode}
        yourCharacterIds={membership.controlledCharacterIds}
        initialRound={round}
      />
    </main>
  );
}
