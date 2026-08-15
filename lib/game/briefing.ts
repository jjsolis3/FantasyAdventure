/**
 * What the table knows, and what it still needs.
 *
 * The complaint this file answers, in the words it arrived in: the girls were
 * "frantically shouting out crazy actions to see what sticks", and the
 * *I don't know what to do* button had become the way out of that — a clue used
 * while the escape room is still running.
 *
 * Reading the code afterwards, the storyteller was not the only problem. Every
 * turn the game extracts memories, opens quests with objectives, and rolls
 * dice, and then shows the players a passage and a text box. A fact learned two
 * scenes ago existed only in a prompt. So the fix is in two halves: the
 * storyteller says what is there (`lib/ai/prompts.ts`), and everything the game
 * *already knew* gets put on the screen. This is the second half.
 *
 * Nothing here is a hint. Every field is something the party has been told, is
 * carrying, or has already done — restated so nobody has to hold four scenes in
 * their head at once. Telling a nine-year-old what she already learned is not
 * giving her the answer; it is the difference between a table that is stuck and
 * a table that is deciding.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client.ts";

/** A turn as it comes back from any of the pages that build a briefing. */
type TurnLike = { metadata: Prisma.JsonValue | null };

/**
 * Everything the table already knows, in one prop.
 *
 * Bundled rather than passed as two, because these travel together through four
 * levels of component — the play page, the client, the round board, one girl's
 * answer box — and two parallel props threaded that far is two chances to
 * forget one.
 */
export type TableBriefing = {
  onTheTable: string[];
  known: KnownFact[];
  /** What the board is still asking for. Shared quests only. */
  needed: NeededObjective[];
};

/**
 * The question on the table, and the things the passage put within reach.
 *
 * Read back off the passage that raised them rather than held in campaign
 * state, so a page opened tomorrow — or on a second phone, or on the television
 * — says the same thing as the one that was there at the time.
 *
 * "The most recent passage that had one" rather than "the most recent passage",
 * and that distinction earns its keep: a round spent talking to each other
 * writes a passage of its own and moves nothing on, so the question from before
 * the conversation is still the live one.
 */
export function tableFrom(turns: TurnLike[]): { whatNow: string | null; onTheTable: string[] } {
  let whatNow: string | null = null;
  let onTheTable: string[] = [];

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const meta = turns[index].metadata as { whatNow?: string; onTheTable?: string[] } | null;
    if (!whatNow && meta?.whatNow?.trim()) whatNow = meta.whatNow.trim();
    if (!onTheTable.length && Array.isArray(meta?.onTheTable) && meta.onTheTable.length) {
      onTheTable = meta.onTheTable.filter((entry) => typeof entry === "string" && entry.trim());
    }
    if (whatNow && onTheTable.length) break;
  }

  return { whatNow, onTheTable };
}

/** How many facts are worth showing at once. More than this is homework. */
export const KNOWN_LIMIT = 6;

export type KnownFact = { id: string; kind: string; content: string };

/**
 * The facts the party has actually collected, most important first.
 *
 * Ranked by importance and then by when it was last mentioned, which is the
 * same ordering the storyteller's own context uses — so what the girls read is
 * what the storyteller is thinking about, and the two cannot drift apart.
 *
 * Scenery is already filtered out upstream: extraction is told to record only
 * things that will still matter in an hour.
 */
export async function knownFacts(campaignId: string, limit = KNOWN_LIMIT): Promise<KnownFact[]> {
  const rows = await db.memory.findMany({
    where: { campaignId },
    orderBy: [{ importance: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
    select: { id: true, kind: true, content: true },
  });
  return rows.map((row) => ({ id: row.id, kind: row.kind, content: row.content }));
}

export type NeededObjective = { id: string; quest: string; text: string; kind: string };

/**
 * What is still outstanding, in the players' own words.
 *
 * Shared quests only. A personal aim is hers until she chooses to say it, and
 * the television is the least private surface in the house — same rule as
 * `screenView`, for the same reason.
 */
export async function neededObjectives(campaignId: string, limit = 5): Promise<NeededObjective[]> {
  const quests = await db.quest.findMany({
    where: { campaignId, status: "ACTIVE", secretForCharacterId: null },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      objectives: {
        where: { doneAtTurn: null },
        orderBy: { position: "asc" },
        select: { id: true, text: true, kind: true },
      },
    },
  });

  const out: NeededObjective[] = [];
  for (const quest of quests) {
    for (const objective of quest.objectives) {
      out.push({ id: objective.id, quest: quest.title, text: objective.text, kind: objective.kind });
      if (out.length === limit) return out;
    }
  }
  return out;
}

export type RecentRoll = {
  id: string;
  characterName: string;
  intent: string;
  total: number;
  target: number;
  outcome: string;
};

/**
 * The last few dice, for the room rather than for the phone that threw them.
 *
 * A roll is the most public thing that happens in an evening and the most
 * privately displayed: it lands in one person's transcript and is gone. On a
 * television it is the thing everybody leans in for.
 */
export async function recentRolls(
  sceneId: string | null,
  namesById: Map<string, string>,
  limit = 4,
): Promise<RecentRoll[]> {
  if (!sceneId) return [];

  const turns = await db.turnEvent.findMany({
    where: { sceneId, type: "DICE_ROLL" },
    orderBy: { ordinal: "desc" },
    take: limit,
    select: { id: true, metadata: true, actorCharacterId: true },
  });

  return turns
    .map((turn) => {
      // The name is not in the blob — a roll is stored as numbers and an actor
      // id, and every surface fills the name in from the party it already has.
      const meta = turn.metadata as {
        intent?: string;
        total?: number;
        target?: number;
        outcome?: string;
      } | null;
      if (!meta || typeof meta.total !== "number" || typeof meta.target !== "number") return null;
      return {
        id: turn.id,
        characterName:
          (turn.actorCharacterId ? namesById.get(turn.actorCharacterId) : null) ?? "Somebody",
        intent: meta.intent?.trim() || "a check",
        total: meta.total,
        target: meta.target,
        outcome: meta.outcome ?? "SUCCESS",
      } satisfies RecentRoll;
    })
    .filter((roll): roll is RecentRoll => roll !== null)
    .reverse();
}
