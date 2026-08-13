import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PlayClient } from "@/components/play/play-client";
import type { TranscriptEntry, DiceDetail } from "@/components/play/transcript";
import { STATS, STAT_INFO } from "@/lib/game/rules";
import { LevelPip } from "@/components/character/level-badge";
import type { AvailableMove } from "@/components/play/family-move-picker";
import { kindFromPerspective, moveNamesFor, movesUnlockedAt } from "@/lib/game/rules";
import { memberCampaignFilter, membershipFor } from "@/lib/game/access";
import { currentRound } from "@/lib/game/rounds";
import { questBoard } from "@/lib/game/quests";
import { QuestList, QuestSummaryLink } from "@/components/campaign/quest-list";
import { resolveImageConfig } from "@/lib/ai/settings";
import { PartySheets, type PartySheet } from "@/components/play/party-sheets";
import { PlayLayout } from "@/components/play/play-layout";
import { ScenePicture } from "@/components/play/scene-picture";
import { scenePicture } from "@/lib/game/scene-picture";
import { PressureClock } from "@/components/play/pressure-clock";
import type { EncounterView } from "@/components/play/encounter-panel";
import { pressureAt, pressureLimit } from "@/lib/game/pressure";
import { abilitiesFor, scopeLabel, unspentAbilities } from "@/lib/game/abilities";
import type { AvailableAbility } from "@/components/play/ability-picker";

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
              knacks: { select: { key: true } },
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

  // What is standing in front of them. One at a time, on purpose: two open
  // encounters is a corridor of obstacles rather than a story.
  const standingSceneId = campaign.scenes.find((scene) => scene.status === "OPEN")?.id;
  const standing = standingSceneId
    ? await db.encounter.findFirst({
        where: { campaignId: campaign.id, sceneId: standingSceneId, resolvedAt: null },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const encounter: EncounterView | null = standing
    ? {
        name: standing.name,
        want: standing.want,
        kind: standing.kind,
        works: standing.works,
        backfires: standing.backfires,
        wayOut: standing.wayOut,
        ground: standing.ground,
        soloName:
          campaign.party.find((member) => member.characterId === standing.soloCharacterId)
            ?.character.name ?? null,
      }
    : null;

  // Pictures are off unless a table has set up somewhere to draw them, so this
  // asks once per page rather than letting every browser find out by failing.
  const picturesOn = (await resolveImageConfig()) !== null;
  // Only OWN_DEVICE campaigns have a waiting room; a shared screen keeps its
  // answers on the page until they are sent.
  const round = campaign.inputMode === "OWN_DEVICE" ? await currentRound(campaign.id) : null;

  const openScene = campaign.scenes.find((scene) => scene.status === "OPEN");
  // Asked of the ladder rather than counted here, so the table and the
  // television can never disagree about which picture this chapter has — and
  // so a chapter that already has one is never sent to a drawing service.
  const picture = openScene
    ? await scenePicture({
        campaignId: campaign.id,
        sceneId: openScene.id,
        actIndex: openScene.actIndex,
        storylineSlug: campaign.storyline.slug,
      })
    : ({ source: "NONE" } as const);
  const hasPicture = picture.source !== "NONE";

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

  // The question the story is currently waiting on. Read back off the passage
  // that raised it rather than held in campaign state, so a page opened
  // tomorrow — or on a second phone — asks the same thing as the one that was
  // there at the time.
  //
  // The most recent passage *that asked something*, not simply the most recent
  // passage: a round spent talking to each other writes a passage of its own
  // and moves nothing on, so the question from before the conversation is still
  // the one on the table.
  const whatNow =
    [...turns]
      .reverse()
      .map((turn) => (turn.metadata as { whatNow?: string } | null)?.whatNow?.trim())
      .find((question) => Boolean(question)) ?? null;

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
        // Named from each helper's own side. The two directions of one move
        // can read differently — a daughter helping her father and a father
        // helping his daughter are the same mechanic and not the same sentence.
        const kindFromMember = kindFromPerspective(row, member.characterId);
        const kindFromOther = kindFromPerspective(row, other.id);

        return movesUnlockedAt(row.bondLevel)
          .filter((move) => !spentKeys.has(`${row.id}:${move.key}`))
          .flatMap((move) => {
            const asMember = moveNamesFor(kindFromMember, move);
            const asOther = moveNamesFor(kindFromOther, move);

            return [
              {
                key: move.key,
                helperId: member.characterId,
                helperName,
                targetId: other.id,
                targetName: other.name,
                name: asMember.name,
                blurb: asMember.blurb,
              },
              {
                key: move.key,
                helperId: other.id,
                helperName: other.name,
                targetId: member.characterId,
                targetName: helperName,
                name: asOther.name,
                blurb: asOther.blurb,
              },
            ];
          });
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

  // What each girl can still spend, worked out once on the server so the table
  // never has to be told "you cannot do that" after tapping it. The turn checks
  // again before committing — this is convenience, not the rule.
  const openSceneId = campaign.scenes.find((scene) => scene.status === "OPEN")?.id;
  const spentSoFar = openSceneId
    ? await db.abilityUse.findMany({
        where: { campaignId: campaign.id },
        select: { characterId: true, abilityKey: true, windowKey: true },
      })
    : [];

  const abilitiesByCharacter = new Map<string, AvailableAbility[]>();
  if (openSceneId) {
    for (const member of campaign.party) {
      const owned = abilitiesFor({
        archetype: member.character.archetype,
        level: member.character.level,
        knackKeys: member.character.knacks.map((knack) => knack.key),
        skills: member.character.skills.map((skill) => ({ name: skill.name, rank: skill.rank })),
      });
      const unspent = new Set(
        unspentAbilities(
          owned,
          spentSoFar.filter((entry) => entry.characterId === member.characterId),
          openSceneId,
          campaign.currentActIndex,
        ).map((ability) => ability.key),
      );

      // Spent ones are kept and marked rather than dropped. "You already used
      // Step In this scene" is a useful thing for a nine-year-old to see; a
      // move that silently vanishes just looks like a bug.
      abilitiesByCharacter.set(
        member.characterId,
        owned.map((ability) => ({
          key: ability.key,
          name: ability.name,
          blurb: ability.blurb,
          scopeLabel: scopeLabel(ability.scope),
          spent: !unspent.has(ability.key),
        })),
      );
    }
  }

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
    <main className="mx-auto max-w-3xl px-6 py-10 lg:max-w-6xl">
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
          {campaign.status === "COMPLETE" ? (
            <>
              {" · "}
              <Link
                href={`/campaigns/${campaign.id}/summary`}
                className="underline hover:text-hearth-300"
              >
                how it went
              </Link>
            </>
          ) : null}
        </p>
      </header>

      <PlayLayout
        openQuests={openQuests.length}
        stats={
          /* Sticky at the top all evening, so a ten-year-old can always see
             what their adventurer is good at. That question interrupts every
             other one, and it is one line to answer. */
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {campaign.party.map((member) => (
              <li key={member.id} className="text-sm">
                <span className="text-hearth-100">{member.character.name}</span>
                <span className="ml-2 align-middle">
                  <LevelPip xp={member.character.xp} />
                </span>
                <span className="ml-2 text-hearth-400">
                  {STATS.map(
                    (stat) => `${STAT_INFO[stat].label[0]}${member.character[stat]}`,
                  ).join(" ")}
                </span>
              </li>
            ))}
          </ul>
        }
        story={
          <>
            {openScene ? (
              <div className="mb-8">
                <ScenePicture
                  campaignId={campaign.id}
                  sceneId={openScene.id}
                  sceneTitle={openScene.title}
                  hasImage={hasPicture}
                  pictureUrl={picture.source === "NONE" ? null : picture.url}
                  enabled={picturesOn}
                />
              </div>
            ) : null}

            {/* Above the recap and below the picture, where the eye lands on
                the way to the story. Renders nothing until it has moved, so a
                party getting on with it never sees a clock at all. */}
            <div className="mb-6">
              <PressureClock
                name={campaign.storyline.pressureName}
                {...pressureAt(campaign.pressure, pressureLimit(campaign.pacing))}
              />
            </div>

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
                abilities: abilitiesByCharacter.get(member.characterId) ?? [],
              }))}
              initialEntries={entries}
              availableMoves={availableMoves}
              canUndo={canUndo}
              inputMode={campaign.inputMode}
              yourCharacterIds={membership.controlledCharacterIds}
              initialRound={round}
              encounter={encounter}
              whatNow={whatNow}
            />
          </>
        }
        party={<PartySheets sheets={sheets} />}
        quests={
          <div className="space-y-5 rounded-xl border border-hearth-800/60 bg-hearth-900/20 p-4">
            <h2 className="font-display text-lg text-hearth-100">Quests and pockets</h2>

            {openQuests.length > 0 ? (
              <QuestList quests={openQuests} compact />
            ) : (
              <p className="text-sm text-hearth-400">
                Nothing on the board yet. A chapter opens its own quest as you reach it.
              </p>
            )}

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
        }
      />
    </main>
  );
}
