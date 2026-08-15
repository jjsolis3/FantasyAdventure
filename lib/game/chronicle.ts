/**
 * Everything one adventurer has done, across every adventure she has been in.
 *
 * The game has been recording this since the first evening and showing it
 * nowhere. Quests remember who found what — `QuestObjective.foundByCharacterId`
 * — and that row is never read again after the turn it was written. Encounters
 * remember how they ended and who took one on alone, and vanish from every
 * screen the moment they resolve. `FamilyMoveUse` has been counting how often
 * two girls have actually used a move together since the feature shipped, and
 * has never been shown to anybody. Meanwhile "how it went" existed, beautifully,
 * for exactly one adventure at a time.
 *
 * So this is a reading problem rather than a collecting one, and it is written
 * that way: almost nothing here is new state. The per-adventure figures are the
 * ones `lib/game/summary.ts` already works out, called rather than
 * reimplemented, so a trophy room and an ending can never disagree about what
 * an evening was worth.
 *
 * Two rules shape what comes back:
 *
 *   - **Personal aims stay hers.** A quest with `secretForCharacterId` set is
 *     private until she finishes it, and somebody else's room never shows one.
 *     Same rule as the party sheets and the television.
 *   - **A tie counts only once agreed.** Confirmed relationships only, so a
 *     proposal nobody has answered cannot put a bond on a wall.
 */

import { db } from "@/lib/db";
import { CONFIRMED_TIES } from "@/lib/game/ties";
import {
  kindFromPerspective,
  movesUnlockedAt,
  moveNamesFor,
  RELATIONSHIP_LABELS,
  bondProgress,
  type RelationshipKind,
} from "@/lib/game/rules";
import { tally, xpFromQuests, xpFromRolls, totalXp, type QuestRecord } from "@/lib/game/summary";
import type { Prisma } from "@/generated/prisma/client.ts";
import type { CheckOutcome } from "@/lib/engine/dice";

/** One throw, as much of it as a trophy room cares about. */
export type RollRecord = { outcome: CheckOutcome; total: number; target: number };

export type RollTally = {
  thrown: number;
  landed: number;
  /** The best margin she has ever beaten a target by, and what it was for. */
  best: number | null;
};

/**
 * Her dice, over a lifetime.
 *
 * Counted rather than averaged, and the best is a *margin* rather than a raw
 * roll. A natural 20 against a target of 8 is luck; beating a hard target by
 * nine is the thing she will want to tell somebody about, and the margin is the
 * only number that can tell them apart.
 */
export function rollTally(rolls: RollRecord[]): RollTally {
  let landed = 0;
  let best: number | null = null;

  for (const roll of rolls) {
    if (roll.outcome === "SUCCESS" || roll.outcome === "CRITICAL") landed += 1;
    const margin = roll.total - roll.target;
    if (margin >= 0 && (best === null || margin > best)) best = margin;
  }

  return { thrown: rolls.length, landed, best };
}

/**
 * What one finished adventure was worth to one adventurer.
 *
 * Worked out exactly the way the ending works it out, because it *is* the
 * ending's arithmetic — `lib/game/summary.ts`, called rather than copied. The
 * only thing this adds is that the answer is written down, so it survives the
 * adventure being deleted.
 */
export function entryFor(options: {
  characterId: string;
  partyCharacterIds: string[];
  quests: QuestRecord[];
  rolls: RollRecord[];
}): {
  chapters: number;
  errands: number;
  ownAims: number;
  xpEarned: number;
  rollsThrown: number;
  rollsLanded: number;
  bestRoll: number | null;
} {
  const counts = tally(options.quests);
  const dice = rollTally(options.rolls);

  return {
    chapters: counts.chapters,
    errands: counts.errands,
    ownAims: counts.ownAims,
    xpEarned: totalXp(
      options.characterId,
      xpFromRolls(
        options.rolls.map((roll) => ({ characterId: options.characterId, outcome: roll.outcome })),
      ),
      xpFromQuests(options.quests, options.partyCharacterIds),
    ),
    rollsThrown: dice.thrown,
    rollsLanded: dice.landed,
    bestRoll: dice.best,
  };
}

/**
 * Writes down what everybody got, at the moment an adventure finishes.
 *
 * Takes a transaction client because it runs inside the turn that ends the
 * story — the same transaction that flips the campaign to COMPLETE, so either
 * both happened or neither did.
 *
 * Upsert rather than create: an ending can be taken back and reached again, and
 * a second row would show the same adventure twice on her road forever.
 */
export async function recordRoad(
  tx: Prisma.TransactionClient,
  campaign: {
    id: string;
    title: string;
    storylineTitle: string;
    partyCharacterIds: string[];
  },
): Promise<void> {
  const quests = await tx.quest.findMany({
    where: { campaignId: campaign.id },
    select: { kind: true, status: true, secretForCharacterId: true },
  });
  const questRecords = quests as QuestRecord[];

  const rollRows = await tx.turnEvent.findMany({
    where: { type: "DICE_ROLL", scene: { campaignId: campaign.id } },
    select: { actorCharacterId: true, metadata: true },
  });

  const byCharacter = new Map<string, RollRecord[]>();
  for (const row of rollRows) {
    if (!row.actorCharacterId) continue;
    const meta = row.metadata as { outcome?: string; total?: number; target?: number } | null;
    if (!meta || typeof meta.total !== "number" || typeof meta.target !== "number") continue;
    const record: RollRecord = {
      outcome: (meta.outcome ?? "SUCCESS") as CheckOutcome,
      total: meta.total,
      target: meta.target,
    };
    const bucket = byCharacter.get(row.actorCharacterId);
    if (bucket) bucket.push(record);
    else byCharacter.set(row.actorCharacterId, [record]);
  }

  const finishedAt = new Date();

  for (const characterId of campaign.partyCharacterIds) {
    const figures = entryFor({
      characterId,
      partyCharacterIds: campaign.partyCharacterIds,
      quests: questRecords,
      rolls: byCharacter.get(characterId) ?? [],
    });

    await tx.roadEntry.upsert({
      where: { characterId_campaignId: { characterId, campaignId: campaign.id } },
      create: {
        characterId,
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        storylineTitle: campaign.storylineTitle,
        finishedAt,
        ...figures,
      },
      update: { campaignTitle: campaign.title, finishedAt, ...figures },
    });
  }
}

export type AdventureRecord = {
  /** Null once the adventure itself has been deleted — see `RoadEntry`. */
  campaignId: string | null;
  title: string;
  storyline: string;
  /** FINISHED, GOING or SET_ASIDE — what a child would say, not the enum. */
  state: "FINISHED" | "GOING" | "SET_ASIDE";
  when: Date | null;
  chapters: number;
  errands: number;
  ownAims: number;
  xpEarned: number;
  rolls: RollTally;
};

/** How an adventure reads on a shelf rather than in the database. */
export function stateOf(status: string): AdventureRecord["state"] {
  if (status === "COMPLETE") return "FINISHED";
  if (status === "PAUSED") return "SET_ASIDE";
  return "GOING";
}

export type Deed = {
  id: string;
  /** "the brass key, green at the teeth" — what the objective actually asked for. */
  what: string;
  /** The item she came back with, when it differed from what was asked for. */
  item: string | null;
  quest: string;
  adventure: string;
};

export type Standing = {
  id: string;
  name: string;
  want: string;
  ending: string | null;
  /** True when she said out loud she was taking it on herself. */
  alone: boolean;
  adventure: string;
};

/**
 * What two adventurers have between them.
 *
 * The part of this that nobody has ever been able to see. A bond level was on
 * the sheet; how many times they have actually spent a move together, how many
 * adventures they have shared, and how often one took up the other's idea were
 * all being counted and never read.
 */
export type Together = {
  otherId: string;
  otherName: string;
  /** "the parent of", from this character's side. */
  tie: string;
  kind: RelationshipKind;
  bondLevel: number;
  /** Progress toward the next level, or null once it is as strong as it gets. */
  into: number;
  needed: number | null;
  /** Names of the moves this bond has unlocked, in her own direction. */
  moves: string[];
  /** How many times they have actually spent one. */
  movesSpent: number;
  adventuresShared: number;
  /** Times one of them took up the other's idea while talking it over. */
  listened: number;
};

export type Chronicle = {
  characterId: string;
  name: string;
  level: number;
  xp: number;
  /** True when the person reading this is the one who answers for her. */
  yours: boolean;
  adventures: AdventureRecord[];
  finished: number;
  deeds: Deed[];
  standings: Standing[];
  together: Together[];
  rolls: RollTally;
  people: { id: string; name: string; about: string; timesMet: number; metIn: string }[];
  given: { id: string; name: string; note: string; adventure: string }[];
  pictures: { id: string; label: string; version: number; campaignId: string }[];
};

/**
 * Reads one adventurer's whole road.
 *
 * `viewerId` decides only what stays private — the road itself is the same
 * whoever is looking, because a bond and a deed are shared facts and hiding
 * them from the other half of the pair would be absurd.
 */
export async function chronicleFor(
  characterId: string,
  viewerId: string,
): Promise<Chronicle | null> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      name: true,
      level: true,
      xp: true,
      userId: true,
      acquaintances: { orderBy: [{ timesMet: "desc" }, { updatedAt: "desc" }] },
      keepsakes: {
        orderBy: { createdAt: "desc" },
        include: { campaign: { select: { title: true } } },
      },
      relationshipsA: {
        where: CONFIRMED_TIES,
        include: { characterB: { select: { id: true, name: true } } },
      },
      relationshipsB: {
        where: CONFIRMED_TIES,
        include: { characterA: { select: { id: true, name: true } } },
      },
    },
  });
  if (!character) return null;

  const yours = character.userId === viewerId;

  const memberships = await db.partyMember.findMany({
    where: { characterId },
    select: {
      campaignId: true,
      campaign: {
        select: {
          id: true,
          title: true,
          status: true,
          completedAt: true,
          lastPlayedAt: true,
          createdAt: true,
          storyline: { select: { title: true } },
          party: { select: { characterId: true } },
          quests: {
            select: {
              id: true,
              kind: true,
              status: true,
              title: true,
              secretForCharacterId: true,
              objectives: {
                where: { foundByCharacterId: characterId },
                select: { id: true, text: true, itemName: true },
              },
            },
          },
          encounters: {
            where: { resolvedAt: { not: null } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              want: true,
              ending: true,
              soloCharacterId: true,
              helperIds: true,
            },
          },
          images: { select: { id: true, kind: true, label: true, version: true } },
        },
      },
    },
  });

  // Every roll she has ever made, in one query rather than one per adventure.
  // Joined through the scene because a turn belongs to a scene and a scene to
  // an adventure; there is no campaign column on a turn.
  const rollRows = await db.turnEvent.findMany({
    where: { type: "DICE_ROLL", actorCharacterId: characterId },
    select: { metadata: true, scene: { select: { campaignId: true } } },
  });

  // Finished adventures whose campaign has since been deleted. The membership
  // cascaded away with it, so these are the ones derivation can no longer see —
  // and the only reason `RoadEntry` exists.
  const orphans = await db.roadEntry.findMany({
    where: { characterId, campaignId: null },
    orderBy: { finishedAt: "desc" },
  });

  const rollsByCampaign = new Map<string, RollRecord[]>();
  const allRolls: RollRecord[] = [];
  for (const row of rollRows) {
    const meta = row.metadata as { outcome?: string; total?: number; target?: number } | null;
    if (!meta || typeof meta.total !== "number" || typeof meta.target !== "number") continue;
    const record: RollRecord = {
      outcome: (meta.outcome ?? "SUCCESS") as CheckOutcome,
      total: meta.total,
      target: meta.target,
    };
    allRolls.push(record);
    const bucket = rollsByCampaign.get(row.scene.campaignId);
    if (bucket) bucket.push(record);
    else rollsByCampaign.set(row.scene.campaignId, [record]);
  }

  const adventures: AdventureRecord[] = [];
  const deeds: Deed[] = [];
  const standings: Standing[] = [];
  const pictures: Chronicle["pictures"] = [];

  for (const membership of memberships) {
    const campaign = membership.campaign;

    // Somebody else's private aim never counts toward anything on this page,
    // and never appears on it. Hers do, because a finished aim is announced to
    // the whole table anyway.
    const visibleQuests = campaign.quests.filter(
      (quest) => !quest.secretForCharacterId || quest.secretForCharacterId === characterId || yours,
    );

    const questRecords: QuestRecord[] = visibleQuests.map((quest) => ({
      kind: quest.kind as QuestRecord["kind"],
      status: quest.status as QuestRecord["status"],
      secretForCharacterId: quest.secretForCharacterId,
    }));

    const counts = tally(questRecords);
    const campaignRolls = rollsByCampaign.get(campaign.id) ?? [];

    adventures.push({
      campaignId: campaign.id,
      title: campaign.title,
      storyline: campaign.storyline.title,
      state: stateOf(campaign.status),
      when: campaign.completedAt ?? campaign.lastPlayedAt ?? campaign.createdAt,
      chapters: counts.chapters,
      errands: counts.errands,
      ownAims: counts.ownAims,
      xpEarned: totalXp(
        characterId,
        xpFromRolls(campaignRolls.map((roll) => ({ characterId, outcome: roll.outcome }))),
        xpFromQuests(
          questRecords,
          campaign.party.map((member) => member.characterId),
        ),
      ),
      rolls: rollTally(campaignRolls),
    });

    // The single most trophy-shaped row in the schema, and until now written
    // once and never read: the objective says who came back with the thing.
    for (const quest of visibleQuests) {
      for (const objective of quest.objectives) {
        deeds.push({
          id: objective.id,
          what: objective.text,
          item: objective.itemName,
          quest: quest.title,
          adventure: campaign.title,
        });
      }
    }

    for (const encounter of campaign.encounters) {
      // Only ones she was actually part of. An encounter the rest of the party
      // sorted out while she was elsewhere is not hers to stand on.
      const hers =
        encounter.soloCharacterId === characterId || encounter.helperIds.includes(characterId);
      if (!hers) continue;

      standings.push({
        id: encounter.id,
        name: encounter.name,
        want: encounter.want,
        ending: encounter.ending,
        alone: encounter.soloCharacterId === characterId,
        adventure: campaign.title,
      });
    }

    for (const image of campaign.images) {
      pictures.push({
        id: image.id,
        label: image.label,
        version: image.version,
        campaignId: campaign.id,
      });
    }
  }

  for (const orphan of orphans) {
    adventures.push({
      // No campaign to link to any more. The page checks this before making the
      // title a link, which is the honest thing: the record survived, the
      // journal did not.
      campaignId: null,
      title: orphan.campaignTitle,
      storyline: orphan.storylineTitle,
      state: "FINISHED",
      when: orphan.finishedAt,
      chapters: orphan.chapters,
      errands: orphan.errands,
      ownAims: orphan.ownAims,
      xpEarned: orphan.xpEarned,
      rolls: {
        thrown: orphan.rollsThrown,
        landed: orphan.rollsLanded,
        best: orphan.bestRoll,
      },
    });
  }

  // Newest first. A road is read from where you are standing.
  adventures.sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0));
  deeds.reverse();
  standings.reverse();

  const together = await togetherFor(character, memberships.map((m) => m.campaignId));

  return {
    characterId: character.id,
    name: character.name,
    level: character.level,
    xp: character.xp,
    yours,
    adventures,
    finished: adventures.filter((adventure) => adventure.state === "FINISHED").length,
    deeds,
    standings,
    together,
    // The lifetime dice, plus whatever the deleted adventures had counted.
    // Their rolls went with the campaign, so the snapshot is the only record
    // that she ever threw them.
    rolls: orphans.reduce(
      (running, orphan) => ({
        thrown: running.thrown + orphan.rollsThrown,
        landed: running.landed + orphan.rollsLanded,
        best:
          orphan.bestRoll !== null && (running.best === null || orphan.bestRoll > running.best)
            ? orphan.bestRoll
            : running.best,
      }),
      rollTally(allRolls),
    ),
    people: character.acquaintances.map((person) => ({
      id: person.id,
      name: person.name,
      about: person.about,
      timesMet: person.timesMet,
      metIn: person.metInCampaignTitle,
    })),
    given: character.keepsakes.map((keepsake) => ({
      id: keepsake.id,
      name: keepsake.name,
      note: keepsake.note,
      // Same wording the shelf on her sheet uses when the adventure is gone.
      adventure: keepsake.campaign?.title ?? "an adventure since forgotten",
    })),
    // Three at most, newest first. A wall of thumbnails is a gallery, and there
    // is already a gallery.
    pictures: pictures.slice(-3).reverse(),
  };
}

type TieCharacter = {
  id: string;
  relationshipsA: { id: string; characterAId: string; aToB: RelationshipKind; bondLevel: number; bondXp: number; characterB: { id: string; name: string } }[];
  relationshipsB: { id: string; characterAId: string; aToB: RelationshipKind; bondLevel: number; bondXp: number; characterA: { id: string; name: string } }[];
};

/** The pair cards, with the counts nobody has ever seen. */
async function togetherFor(character: TieCharacter, campaignIds: string[]): Promise<Together[]> {
  const rows = [
    ...character.relationshipsA.map((row) => ({ row, other: row.characterB })),
    ...character.relationshipsB.map((row) => ({ row, other: row.characterA })),
  ];
  if (rows.length === 0) return [];

  const relationshipIds = rows.map((entry) => entry.row.id);

  // Two counts, one query each, keyed by relationship so a pair card can say
  // "you have used this four times" rather than only "you could".
  const [moveUses, listens] = await Promise.all([
    db.familyMoveUse.groupBy({
      by: ["relationshipId"],
      where: { relationshipId: { in: relationshipIds } },
      _count: { _all: true },
    }),
    db.listeningBond.groupBy({
      by: ["relationshipId"],
      where: { relationshipId: { in: relationshipIds } },
      _count: { _all: true },
    }),
  ]);

  const spentBy = new Map(moveUses.map((row) => [row.relationshipId, row._count._all]));
  const listenedBy = new Map(listens.map((row) => [row.relationshipId, row._count._all]));

  // How many of her adventures each of them also travelled in.
  const shared = await db.partyMember.groupBy({
    by: ["characterId"],
    where: {
      campaignId: { in: campaignIds },
      characterId: { in: rows.map((entry) => entry.other.id) },
    },
    _count: { _all: true },
  });
  const sharedBy = new Map(shared.map((row) => [row.characterId, row._count._all]));

  return rows
    .map(({ row, other }) => {
      const kind = kindFromPerspective(row, character.id);
      const bond = bondProgress(row.bondXp);

      return {
        otherId: other.id,
        otherName: other.name,
        tie: RELATIONSHIP_LABELS[kind],
        kind,
        bondLevel: row.bondLevel,
        into: bond.into,
        needed: bond.needed,
        moves: movesUnlockedAt(row.bondLevel).map((move) => moveNamesFor(kind, move).name),
        movesSpent: spentBy.get(row.id) ?? 0,
        adventuresShared: sharedBy.get(other.id) ?? 0,
        listened: listenedBy.get(row.id) ?? 0,
      };
    })
    .sort((a, b) => b.bondLevel - a.bondLevel || a.otherName.localeCompare(b.otherName));
}
