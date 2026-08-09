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
  skills: { id: string; xp: number; rank: number }[];
  relationships: { id: string; bondXp: number; bondLevel: number }[];
  /** Items that existed, with their counts. Anything newer was picked up. */
  inventory: { id: string; quantity: number }[];
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
  const [campaign, scenes, characters, skills, relationships, inventory, memories, moveUses] =
    await Promise.all([
      tx.campaign.findUniqueOrThrow({ where: { id: campaignId } }),
      tx.scene.findMany({ where: { campaignId }, orderBy: { index: "asc" } }),
      tx.character.findMany({ where: { id: { in: characterIds } } }),
      tx.characterSkill.findMany({ where: { characterId: { in: characterIds } } }),
      tx.relationship.findMany({
        where: {
          characterAId: { in: characterIds },
          characterBId: { in: characterIds },
        },
      }),
      tx.inventoryItem.findMany({ where: { characterId: { in: characterIds } } }),
      tx.memory.findMany({ where: { campaignId } }),
      tx.familyMoveUse.findMany({ where: { campaignId }, select: { id: true } }),
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
    relationships: relationships.map((r) => ({
      id: r.id,
      bondXp: r.bondXp,
      bondLevel: r.bondLevel,
    })),
    inventory: inventory.map((i) => ({ id: i.id, quantity: i.quantity })),
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
 * Ownership is checked here rather than trusted from the caller: this deletes
 * transcript rows, and it must not be reachable for somebody else's adventure.
 */
export async function undoLastTurn(campaignId: string, userId: string): Promise<UndoResult> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ownerId: userId },
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

    for (const skill of state.skills) {
      await tx.characterSkill.update({
        where: { id: skill.id },
        data: { xp: skill.xp, rank: skill.rank },
      });
    }

    for (const relationship of state.relationships) {
      await tx.relationship.update({
        where: { id: relationship.id },
        data: { bondXp: relationship.bondXp, bondLevel: relationship.bondLevel },
      });
    }

    // Items picked up this turn go; items topped up go back to their old count.
    const characterIds = campaign.party.map((member) => member.characterId);
    const keptItemIds = state.inventory.map((item) => item.id);
    await tx.inventoryItem.deleteMany({
      where: { characterId: { in: characterIds }, id: { notIn: keptItemIds } },
    });
    for (const item of state.inventory) {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: item.quantity },
      });
    }

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
