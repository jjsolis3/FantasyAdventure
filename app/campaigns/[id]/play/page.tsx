import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PlayClient } from "@/components/play/play-client";
import type { TranscriptEntry, DiceDetail } from "@/components/play/transcript";
import { STATS, STAT_INFO } from "@/lib/game/rules";
import { LevelPip } from "@/components/character/level-badge";
import type { AvailableMove } from "@/components/play/family-move-picker";
import {
  bondProgress,
  kindFromPerspective,
  moveNamesFor,
  movesUnlockedAt,
  movesUnlockedBetween,
} from "@/lib/game/rules";
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
import { clockMoves } from "@/lib/game/clock-log";
import { knownPeople } from "@/lib/game/acquaintances";
import { KnownPeople } from "@/components/campaign/known-people";
import { abilitiesFor, scopeLabel, unspentAbilities } from "@/lib/game/abilities";
import {
  alreadyTried,
  knownFacts,
  leadsFrom,
  neededObjectives,
  tableFrom,
  yourAims,
} from "@/lib/game/briefing";
import type { AvailableAbility } from "@/components/play/ability-picker";
import { CONFIRMED_TIES } from "@/lib/game/ties";
import { talkNudge, turnsSinceTalking } from "@/lib/game/talk";
import { lookOf, lookSentence } from "@/lib/game/wardrobe";
import { characterPicture } from "@/lib/game/character-picture";
import { chapterCard, recapsFor } from "@/lib/game/recap";
import { ChapterCard } from "@/components/play/chapter-card";

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
              art: { select: { version: true, lookKey: true } },
              skills: { orderBy: { name: "asc" } },
              knacks: { select: { key: true } },
              inventory: { orderBy: { name: "asc" } },
              relationshipsA: {
                where: CONFIRMED_TIES,
                include: { characterB: { select: { id: true, name: true } } },
              },
              relationshipsB: {
                where: CONFIRMED_TIES,
                include: { characterA: { select: { id: true, name: true } } },
              },
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

  // The question the story is currently waiting on, and the things the passage
  // put within reach. See `lib/game/briefing.ts` for why they are read back off
  // the passage rather than held in campaign state.
  const { whatNow, onTheTable } = tableFrom(turns);

  // What they have actually learned, so far. Extraction has been collecting
  // this since the first turn and, until now, showing it to nobody but the
  // storyteller.
  const known = await knownFacts(campaign.id);

  // What is still outstanding, on the story tab rather than behind the quest
  // tab. A family spent a whole evening inventing goals — "find the faceless
  // demon creature" — while "the old family album, a camera that still takes
  // film" sat one tap away on a screen nobody opened mid-turn.
  const needed = await neededObjectives(campaign.id, 5, campaign.turnCounter);

  // Who this party knows from earlier adventures. The same loader the
  // storyteller's own context uses, so the room and the model can never
  // disagree about who is out there.
  const people = await knownPeople(db, {
    campaignId: campaign.id,
    party: campaign.party.map((member) => ({
      characterId: member.characterId,
      name: member.character.name,
    })),
  });

  // Why the clock stands where it does. The position has been on screen since
  // the clock was built; what put it there has not, and a rule you cannot check
  // is a rule a child resents rather than learns. Chapter-scoped, because a new
  // chapter starts the clock at nothing.
  const moved = await clockMoves(campaign.id, campaign.currentActIndex);

  // And what this player is quietly after, which the list above deliberately
  // leaves out. `neededObjectives` feeds the television as well as this page, so
  // a personal aim comes down its own viewer-scoped path — see `yourAims`.
  const aims = await yourAims(campaign.id, user.id, campaign.turnCounter);

  // Somewhere worth going next. The gap a real evening found: the game could
  // put something in front of the party and had no way at all to point down a
  // road, so a family told to find a sky-map was left with a village and no
  // reason to walk into any particular door.
  const leads = leadsFrom(turns);

  // And what they have already had a go at, so the same barn is not searched
  // three times. Gathered across the whole chapter rather than the open scene:
  // a scene ends when the party moves, so a family going in circles racks up
  // several of them and a scene-scoped checklist empties itself exactly when it
  // is most needed. See `alreadyTried`.
  const attempts = await db.turnEvent.findMany({
    where: {
      type: "PLAYER_ACTION",
      scene: { campaignId: campaign.id, actIndex: campaign.currentActIndex },
    },
    orderBy: [{ createdAt: "asc" }, { ordinal: "asc" }],
    select: { type: true, content: true, metadata: true, sceneId: true },
  });
  const tried = alreadyTried(attempts, openScene?.id ?? null);

  // Whether the game should ask them to confer, and why. Worked out here rather
  // than in the browser because every input is already on this page — the
  // encounter, the clock, the passages — and because both screens should say
  // the same thing at the same moment. See `lib/game/talk.ts`.
  const nudge = talkNudge({
    encounterName: standing?.name ?? null,
    soloed: standing?.soloCharacterId != null,
    sinceTalking: turnsSinceTalking(turns),
    passages: turns.filter((turn) => turn.type === "NARRATION").length,
    clock: pressureAt(campaign.pressure, pressureLimit(campaign.pacing)),
  });

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
    level: member.character.level,
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
        const kind = kindFromPerspective(row, member.characterId);
        const progress = bondProgress(row.bondXp);
        // Named from this side of the pair, because the two directions of one
        // move read differently — a daughter helping her father and a father
        // helping his daughter are the same mechanic and not the same sentence.
        const next = movesUnlockedBetween(row.bondLevel, row.bondLevel + 1)[0];

        return {
          otherId: other.id,
          otherName: other.name,
          kind,
          bondLevel: row.bondLevel,
          into: progress.into,
          needed: progress.needed,
          moves: movesUnlockedAt(row.bondLevel).map((move) => moveNamesFor(kind, move).name),
          nextMove: next
            ? { name: moveNamesFor(kind, next).name, blurb: moveNamesFor(kind, next).blurb }
            : null,
        };
      })
      .filter((bond) => inParty.has(bond.otherId)),
    playedBy: member.character.user.displayName,
    yours: member.character.userId === user.id,
    portraitVersion: member.character.portrait?.version ?? null,
    look: lookSentence(lookOf(member.character)),
    picture: characterPicture({
      id: member.characterId,
      name: member.character.name,
      look: lookOf(member.character),
      portraitVersion: member.character.portrait?.version ?? null,
      art: member.character.art,
    }),
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

  // What actually changed in each chapter behind them, read off the milestones
  // the game wrote at the time. The prose summary alone was "just repeating what
  // was said in the passage" — which is what happens when you ask a model to
  // shorten prose without telling it which parts mattered.
  const recap = await recapsFor(
    campaign.scenes.filter((scene) => scene.status === "CLOSED" && scene.summary),
  );

  // Offered only once a turn has actually been played — the snapshot is
  // written by a turn and cleared when it is used, so its presence is the
  // honest answer to "is there something to take back?".
  const canUndo = (await db.turnSnapshot.count({ where: { campaignId: campaign.id } })) > 0;
  const act = campaign.storyline.acts.find((entry) => entry.index === campaign.currentActIndex);

  // The card that marks a chapter turning, shown for the whole of the new
  // chapter's first scene. "First scene of this act" is the condition rather
  // than "a chapter just ended this second": a family that refreshes, or the
  // parent who was in the kitchen, should still get to read it.
  const firstOfChapter =
    openScene !== undefined &&
    campaign.currentActIndex > 1 &&
    !campaign.scenes.some(
      (scene) => scene.actIndex === openScene.actIndex && scene.index < openScene.index,
    );

  const finishedAct = firstOfChapter
    ? campaign.storyline.acts.find((entry) => entry.index === campaign.currentActIndex - 1)
    : undefined;

  const card = finishedAct
    ? await chapterCard({
        campaignId: campaign.id,
        finishedIndex: finishedAct.index,
        finishedTitle: finishedAct.title,
        next: act ? { index: act.index, title: act.title } : null,
        party: campaign.party.map((member) => ({
          characterId: member.characterId,
          name: member.character.name,
        })),
      })
    : null;

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
          {" · "}
          {/* Not only at the end. A family picking this up on a school night
              wants "where were we" answered before the first turn, and the way
              in was previously behind the ending — which you reach by finishing
              the adventure you were trying to remember. */}
          <Link
            href={`/campaigns/${campaign.id}/journal`}
            className="underline hover:text-hearth-300"
          >
            read it back
          </Link>
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
                  <LevelPip level={member.character.level} xp={member.character.xp} />
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
                moves={moved}
              />
            </div>

            {/* Above the recap and above the story: when a chapter has just
                turned, this is what the table is actually looking at. */}
            {card ? <ChapterCard card={card} /> : null}

            {recap.length > 0 ? (
              <details className="mb-8 rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-4">
                <summary className="cursor-pointer text-sm text-hearth-300">
                  The story so far ({recap.length} {recap.length === 1 ? "chapter" : "chapters"})
                </summary>
                <div className="mt-3 space-y-3">
                  {recap.map((scene) => (
                    <div key={scene.sceneId}>
                      <p className="text-sm font-medium text-hearth-300">{scene.title}</p>
                      <p className="text-sm leading-relaxed text-hearth-200/70">{scene.summary}</p>

                      {/* The ledger under the prose. Not a second summary — the
                          things that are still true tomorrow, in the words the
                          game used when they happened. */}
                      {scene.changed.length > 0 ? (
                        <ul className="mt-1.5 space-y-0.5">
                          {scene.changed.map((line) => (
                            <li key={line} className="text-xs text-moss-400/90">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {scene.rolls.thrown > 0 ? (
                        <p className="mt-1 text-xs text-hearth-500">
                          {scene.rolls.landed} of {scene.rolls.thrown} rolls landed
                        </p>
                      ) : null}
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
              briefing={{ onTheTable, known, needed, leads, tried }}
              yourAims={aims}
              talkNudge={nudge?.reason ?? null}
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

            {/* Who they know from before, at the table. The storyteller has
                been told this since acquaintances were built and the family
                never has — so somebody could walk back in two adventures later
                and be met with "who's that?", which is the opposite of what
                remembering them is for. */}
            {people.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
                  People you know
                </h3>
                <KnownPeople people={people} compact />
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
