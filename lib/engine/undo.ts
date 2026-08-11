/**
 * Taking back the last turn.
 *
 * A turn touches nine tables, and several of its writes are upserts — a memory
 * about an NPC is updated rather than added the second time it appears, and a
 * second rope raises a quantity rather than creating a row. Reversing that by
 * computing inverse operations would mean keeping the undo in step with every
 * future change to the commit path, which is exactly the kind of coupling that
 * rots quietly.
 *
 * So this records the *before* state instead. The snapshot is taken inside the
 * turn's own transaction, so it is either stored with the turn or not at all,
 * and restoring it is a set of plain writes rather than an attempt to reason
 * backwards.
 *
 * One turn deep, deliberately. A table asks to undo when a child mistypes or a
 * beat lands wrong — both of which are noticed immediately. Keeping a history
 * would grow without bound and invite a much harder question about how far back
 * is still safe.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client.ts";
import { memberCampaignFilter } from "@/lib/game/access";

/** A transaction client, or the plain one. */
type Db = Prisma.TransactionClient | typeof db;

export type SnapshotState = {
  campaign: {
    turnCounter: number;
    currentActIndex: number;
    status: string;
    completedAt: string | null;
    lastPlayedAt: string | null;
  };
  /** Scenes that existed. Anything newer was created by the turn. */
  scenes: {
    id: string;
    title: string;
    location: string | null;
    status: string;
    summary: string | null;
    closedAt: string | null;
  }[];
  characters: { id: string; xp: number; level: number }[];
  /**
   * Skills as they stood. Anything newer was *learned* this turn, which is now
   * possible — enough practice at something turns into a skill, and taking the
   * turn back has to take that with it.
   */
  skills: { id: string; xp: number; rank: number }[];
  /** The practice ledger, so counting starts again from where it was. */
  practices: { id: string; attempts: number; learnedAtTurn: number | null }[];
  relationships: { id: string; bondXp: number; bondLevel: number }[];
  /**
   * Items that existed, in full. Anything newer was picked up this turn.
   *
   * Whole rows rather than counts, because a turn can now *remove* an item:
   * finishing a quest spends what it took. Restoring by id alone would try to
   * update a row that is no longer there.
   */
  inventory: {
    id: string;
    characterId: string;
    name: string;
    description: string | null;
    quantity: number;
    foundInCampaignId: string | null;
  }[];
  /** Quest and objective state. Anything newer was opened this turn. */
  quests: {
    id: string;
    status: string;
    completedAtTurn: number | null;
    completedAt: string | null;
  }[];
  objectives: {
    id: string;
    doneAtTurn: number | null;
    itemName: string | null;
    foundByCharacterId: string | null;
    consumed: boolean;
  }[];
  /** Keepsakes that existed. Anything newer was made by spending an item. */
  keepsakeIds: string[];
  /** Memories that existed. Anything newer was learned this turn. */
  memories: { id: string; content: string; importance: number; lastSeenAt: number }[];
  familyMoveUseIds: string[];
};

/**
 * Reads everything a turn can change.
 *
 * Must run before the turn writes anything, and inside its transaction.
 */
export async function captureSnapshot(
  tx: Db,
  campaignId: string,
  characterIds: string[],
): Promise<SnapshotState> {
  const [
    campaign,
    scenes,
    characters,
    skills,
    practices,
    relationships,
    inventory,
    memories,
    moveUses,
    quests,
    objectives,
    keepsakes,
  ] = await Promise.all([
      tx.campaign.findUniqueOrThrow({ where: { id: campaignId } }),
      tx.scene.findMany({ where: { campaignId }, orderBy: { index: "asc" } }),
      tx.character.findMany({ where: { id: { in: characterIds } } }),
      tx.characterSkill.findMany({ where: { characterId: { in: characterIds } } }),
      tx.practice.findMany({ where: { characterId: { in: characterIds } } }),
      tx.relationship.findMany({
        where: {
          characterAId: { in: characterIds },
          characterBId: { in: characterIds },
        },
      }),
      tx.inventoryItem.findMany({ where: { characterId: { in: characterIds } } }),
      tx.memory.findMany({ where: { campaignId } }),
      tx.familyMoveUse.findMany({ where: { campaignId }, select: { id: true } }),
      tx.quest.findMany({ where: { campaignId } }),
      tx.questObjective.findMany({ where: { quest: { campaignId } } }),
      tx.keepsake.findMany({
        where: { characterId: { in: characterIds } },
        select: { id: true },
      }),
    ]);

  return {
    campaign: {
      turnCounter: campaign.turnCounter,
      currentActIndex: campaign.currentActIndex,
      status: campaign.status,
      completedAt: campaign.completedAt?.toISOString() ?? null,
      lastPlayedAt: campaign.lastPlayedAt?.toISOString() ?? null,
    },
    scenes: scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      location: scene.location,
      status: scene.status,
      summary: scene.summary,
      closedAt: scene.closedAt?.toISOString() ?? null,
    })),
    characters: characters.map((c) => ({ id: c.id, xp: c.xp, level: c.level })),
    skills: skills.map((s) => ({ id: s.id, xp: s.xp, rank: s.rank })),
    practices: practices.map((p) => ({
      id: p.id,
      attempts: p.attempts,
      learnedAtTurn: p.learnedAtTurn,
    })),
    relationships: relationships.map((r) => ({
      id: r.id,
      bondXp: r.bondXp,
      bondLevel: r.bondLevel,
    })),
    inventory: inventory.map((i) => ({
      id: i.id,
      characterId: i.characterId,
      name: i.name,
      description: i.description,
      quantity: i.quantity,
      foundInCampaignId: i.foundInCampaignId,
    })),
    quests: quests.map((q) => ({
      id: q.id,
      status: q.status,
      completedAtTurn: q.completedAtTurn,
      completedAt: q.completedAt?.toISOString() ?? null,
    })),
    objectives: objectives.map((o) => ({
      id: o.id,
      doneAtTurn: o.doneAtTurn,
      itemName: o.itemName,
      foundByCharacterId: o.foundByCharacterId,
      consumed: o.consumed,
    })),
    keepsakeIds: keepsakes.map((k) => k.id),
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      importance: m.importance,
      lastSeenAt: m.lastSeenAt,
    })),
    familyMoveUseIds: moveUses.map((u) => u.id),
  };
}

export type UndoResult =
  | {
      ok: true;
      turnCounter: number;
      /**
       * What each character had said, so a retelling can restore it rather than
       * making everyone type it again. Nobody wants to re-enter three sentences
       * because the storyteller misread one of them.
       */
      actions: { characterId: string; text: string }[];
    }
  | { ok: false; reason: string };

/**
 * Restores the state saved before the most recent turn.
 *
 * Membership is checked here rather than trusted from the caller: this deletes
 * transcript rows, and it must not be reachable for an adventure you are not
 * travelling in.
 *
 * Anyone at the table may take a turn back, not only the household that started
 * the adventure. A storyteller that misread a child's answer has to be
 * correctable by whoever is holding a device at the time, and the correction is
 * visible to everyone the moment it happens.
 */
export async function undoLastTurn(campaignId: string, userId: string): Promise<UndoResult> {
  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(campaignId, userId),
    include: { snapshot: true, party: { select: { characterId: true } } },
  });

  if (!campaign) return { ok: false, reason: "Adventure not found." };
  if (!campaign.snapshot) {
    return { ok: false, reason: "There is no turn to take back yet." };
  }

  const snapshot = campaign.snapshot;
  const state = snapshot.state as unknown as SnapshotState;
  const keptSceneIds = new Set(state.scenes.map((scene) => scene.id));

  // Read before the delete, obviously.
  const spoken = await db.turnEvent.findMany({
    where: {
      sceneId: { in: [...keptSceneIds] },
      ordinal: { gte: snapshot.fromOrdinal },
      type: "PLAYER_ACTION",
    },
    orderBy: { ordinal: "asc" },
    select: { actorCharacterId: true, content: true },
  });

  await db.$transaction(async (tx) => {
    // Scenes the turn opened. Deleting them removes their turn events too, so
    // this has to come before the ordinal sweep rather than after.
    await tx.scene.deleteMany({
      where: { campaignId, id: { notIn: [...keptSceneIds] } },
    });

    // Everything the turn wrote into the scene that was open.
    await tx.turnEvent.deleteMany({
      where: { sceneId: { in: [...keptSceneIds] }, ordinal: { gte: snapshot.fromOrdinal } },
    });

    for (const scene of state.scenes) {
      await tx.scene.update({
        where: { id: scene.id },
        data: {
          title: scene.title,
          location: scene.location,
          status: scene.status as "OPEN" | "CLOSED",
          summary: scene.summary,
          closedAt: scene.closedAt ? new Date(scene.closedAt) : null,
        },
      });
    }

    for (const character of state.characters) {
      await tx.character.update({
        where: { id: character.id },
        data: { xp: character.xp, level: character.level },
      });
    }

    // A skill learned this turn goes away with it; the rest go back to the
    // ranks they held. Delete before update, so the ids left to update are all
    // ones that still exist.
    const characterIdsForSkills = campaign.party.map((member) => member.characterId);
    await tx.characterSkill.deleteMany({
      where: {
        characterId: { in: characterIdsForSkills },
        id: { notIn: state.skills.map((skill) => skill.id) },
      },
    });
    for (const skill of state.skills) {
      await tx.characterSkill.update({
        where: { id: skill.id },
        data: { xp: skill.xp, rank: skill.rank },
      });
    }

    // And the ledger that would otherwise still say she had four goes at it.
    await tx.practice.deleteMany({
      where: {
        characterId: { in: characterIdsForSkills },
        id: { notIn: state.practices.map((practice) => practice.id) },
      },
    });
    for (const practice of state.practices) {
      await tx.practice.update({
        where: { id: practice.id },
        data: { attempts: practice.attempts, learnedAtTurn: practice.learnedAtTurn },
      });
    }

    for (const relationship of state.relationships) {
      await tx.relationship.update({
        where: { id: relationship.id },
        data: { bondXp: relationship.bondXp, bondLevel: relationship.bondLevel },
      });
    }

    // Items picked up this turn go; items topped up go back to their old count;
    // items *spent* on finishing a quest come back, which is why this upserts
    // rather than updates.
    const characterIds = campaign.party.map((member) => member.characterId);
    const keptItemIds = state.inventory.map((item) => item.id);
    await tx.inventoryItem.deleteMany({
      where: { characterId: { in: characterIds }, id: { notIn: keptItemIds } },
    });
    for (const item of state.inventory) {
      await tx.inventoryItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          characterId: item.characterId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          foundInCampaignId: item.foundInCampaignId,
        },
        update: { quantity: item.quantity },
      });
    }

    // Quests opened this turn go; the rest go back to how they stood, which
    // un-finishes anything this turn completed and un-ticks what it found.
    const keptQuestIds = state.quests.map((quest) => quest.id);
    await tx.quest.deleteMany({ where: { campaignId, id: { notIn: keptQuestIds } } });
    for (const quest of state.quests) {
      await tx.quest.update({
        where: { id: quest.id },
        data: {
          status: quest.status as "ACTIVE" | "COMPLETE" | "ABANDONED",
          completedAtTurn: quest.completedAtTurn,
          completedAt: quest.completedAt ? new Date(quest.completedAt) : null,
        },
      });
    }
    for (const objective of state.objectives) {
      await tx.questObjective.update({
        where: { id: objective.id },
        data: {
          doneAtTurn: objective.doneAtTurn,
          itemName: objective.itemName,
          foundByCharacterId: objective.foundByCharacterId,
          consumed: objective.consumed,
        },
      });
    }

    // And the keepsakes the spending made.
    await tx.keepsake.deleteMany({
      where: { characterId: { in: characterIds }, id: { notIn: state.keepsakeIds } },
    });

    // Same shape for memories: forget what was learned, restore what changed.
    const keptMemoryIds = state.memories.map((memory) => memory.id);
    await tx.memory.deleteMany({ where: { campaignId, id: { notIn: keptMemoryIds } } });
    for (const memory of state.memories) {
      await tx.memory.update({
        where: { id: memory.id },
        data: {
          content: memory.content,
          importance: memory.importance,
          lastSeenAt: memory.lastSeenAt,
        },
      });
    }

    // A Family Move spent on an undone turn is available again.
    await tx.familyMoveUse.deleteMany({
      where: { campaignId, id: { notIn: state.familyMoveUseIds } },
    });

    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        turnCounter: state.campaign.turnCounter,
        currentActIndex: state.campaign.currentActIndex,
        status: state.campaign.status as "SETUP" | "ACTIVE" | "COMPLETE",
        completedAt: state.campaign.completedAt ? new Date(state.campaign.completedAt) : null,
        lastPlayedAt: state.campaign.lastPlayedAt ? new Date(state.campaign.lastPlayedAt) : null,
      },
    });

    // Any round still collecting was written against a scene that has just
    // stopped being true, so it goes with the turn it was answering.
    await tx.turnRound.updateMany({
      where: { campaignId, status: { in: ["COLLECTING", "RESOLVING"] } },
      data: { status: "CANCELLED" },
    });

    // Undo is one turn deep, so the snapshot is spent. Leaving it would let a
    // second press "undo" a turn that is no longer there.
    await tx.turnSnapshot.delete({ where: { campaignId } });
  });

  return {
    ok: true,
    turnCounter: state.campaign.turnCounter,
    actions: spoken
      .filter((event) => event.actorCharacterId !== null)
      .map((event) => ({ characterId: event.actorCharacterId as string, text: event.content })),
  };
}
