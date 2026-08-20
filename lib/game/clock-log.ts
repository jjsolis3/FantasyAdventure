/**
 * Reading the clock's receipts back.
 *
 * Kept apart from `lib/game/pressure.ts` so that file stays pure — it holds the
 * arithmetic of the clock and is unit-tested without a database anywhere near
 * it. This is the half that needs rows.
 *
 * Every movement is an ordinary `SYSTEM` turn event, exactly like every other
 * milestone the game writes, and carries its detail in `metadata`. That choice
 * is what makes the history survive things nothing else would: taking a turn
 * back deletes the turn's events along with the turn, so a clock movement that
 * was undone stops being in the history — which is right, and which a separate
 * table would have had to be taught.
 *
 * Campaign-wide rather than scene-scoped, and that is deliberate. A clock runs
 * for a whole chapter and scenes close under it; a family asking "when did this
 * fill up?" is asking about the chapter they are in, not the room they are
 * standing in.
 */

import { db } from "@/lib/db";
import type { ClockMove } from "@/lib/game/pressure";

/** The metadata a clock movement carries, so it can be told from a milestone. */
export type ClockEventMeta = {
  clock: "TICK" | "SPENT";
  turn: number;
  level: number;
  limit: number;
  tried?: string[];
};

/** True for a SYSTEM event that is a clock movement rather than a milestone. */
export function isClockEvent(metadata: unknown): boolean {
  const meta = metadata as { clock?: unknown } | null;
  return meta?.clock === "TICK" || meta?.clock === "SPENT";
}

/** How much history is worth showing. Beyond this it is a ledger, not a lesson. */
export const MOVES_LIMIT = 6;

/**
 * What has moved the clock in this chapter, newest first.
 *
 * Chapter-scoped because the clock is: a new act starts it at nothing, so
 * movements from the last one describe a problem the party has already left
 * behind, and showing them would suggest a debt that is not owed.
 */
export async function clockMoves(
  campaignId: string,
  actIndex: number,
  limit = MOVES_LIMIT,
): Promise<ClockMove[]> {
  const rows = await db.turnEvent.findMany({
    where: {
      type: "SYSTEM",
      scene: { campaignId, actIndex },
      // Postgres JSON path filters, so the database picks the clock movements
      // out rather than this reading every milestone in the chapter to throw
      // most of them away. Two exact matches rather than one "has a clock key",
      // because an exact match is the one form every adapter agrees on — the
      // same shape `turnsSinceTalking` uses for `spoken`.
      OR: [
        { metadata: { path: ["clock"], equals: "TICK" } },
        { metadata: { path: ["clock"], equals: "SPENT" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { metadata: true },
  });

  return rows
    .map((row) => {
      const meta = row.metadata as ClockEventMeta | null;
      if (!meta || (meta.clock !== "TICK" && meta.clock !== "SPENT")) return null;

      return {
        turn: typeof meta.turn === "number" ? meta.turn : 0,
        level: typeof meta.level === "number" ? meta.level : 0,
        limit: typeof meta.limit === "number" ? meta.limit : 0,
        spent: meta.clock === "SPENT",
        tried: Array.isArray(meta.tried)
          ? meta.tried.filter((entry): entry is string => typeof entry === "string")
          : [],
      } satisfies ClockMove;
    })
    .filter((move): move is ClockMove => move !== null);
}
