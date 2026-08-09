/**
 * Rounds: collecting one turn's answers from several devices.
 *
 * The rule the table asked for is that everybody answers, and then the turn is
 * taken together. On a shared screen that falls out of the page — one person
 * types every answer and presses send. Apart, it has to be built, and the two
 * hard parts are both about agreement rather than about typing:
 *
 *   - There must be exactly one round open at a time, however many browsers ask
 *     for one. The unique constraint on (campaignId, number) settles that: two
 *     devices compute the same next number and one of them loses the insert.
 *
 *   - The turn must run exactly once, whichever browser notices first that
 *     everyone is in. `claimRound` is a conditional update, so the claim is
 *     decided by the database rather than by whose request arrived first.
 *
 * Everything else here is bookkeeping so that every screen can show the same
 * thing: who has answered, what they said, and how far along the turn is.
 */

import { db, isUniqueViolation } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client.ts";

export type RoundMode = "ACTION" | "TALK";
export type RoundStatus = "COLLECTING" | "RESOLVING" | "RESOLVED" | "CANCELLED";

export type FamilyMoveChoice = { key: string; helperId: string; targetId: string };

export type RoundAnswerView = {
  characterId: string;
  text: string;
  /** "Waits and watches" — answered, but doing nothing. */
  waiting: boolean;
  /** Who typed it, so a screen can say "you". */
  userId: string | null;
  answeredAt: string;
};

export type RoundView = {
  id: string;
  number: number;
  mode: RoundMode;
  status: RoundStatus;
  /** The pipeline stage the resolving browser last reported. */
  stage: string | null;
  error: string | null;
  retelling: boolean;
  correction: string | null;
  familyMove: FamilyMoveChoice | null;
  /** The party, in turn order — which is the order the answers are told in. */
  partyIds: string[];
  answers: RoundAnswerView[];
  /** Party members with nothing entered yet. */
  waitingFor: string[];
  everyoneIn: boolean;
  /** Somebody is actually doing something, so there is a turn worth taking. */
  hasActions: boolean;
  /**
   * Whether the last answer should start the turn by itself.
   *
   * True for an ordinary round: the point of waiting for everybody is that the
   * story moves the moment everybody is ready, without one person also having
   * to be the one who presses send. A retelling is the exception — its answers
   * are already there, and the table opened it to change something.
   */
  startsItself: boolean;
  claimedAt: string | null;
};

/** Rounds that are still going on, in one form or another. */
const LIVE: RoundStatus[] = ["COLLECTING", "RESOLVING"];

/**
 * How long a claim is honoured before another browser may take the turn over.
 *
 * Long enough to outlast a slow turn on a local model — the route allows five
 * minutes — and short enough that a laptop closed mid-turn does not strand the
 * table for the evening.
 */
export const CLAIM_TIMEOUT_MS = 6 * 60 * 1000;

type RoundRow = Prisma.TurnRoundGetPayload<{ include: { answers: true } }>;

function asFamilyMove(value: Prisma.JsonValue | null): FamilyMoveChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { key, helperId, targetId } = record;
  if (typeof key !== "string" || typeof helperId !== "string" || typeof targetId !== "string") {
    return null;
  }
  return { key, helperId, targetId };
}

function view(round: RoundRow, partyIds: string[]): RoundView {
  const answers = round.answers
    .filter((answer) => partyIds.includes(answer.characterId))
    .map((answer) => ({
      characterId: answer.characterId,
      text: answer.text,
      waiting: answer.waiting,
      userId: answer.userId,
      answeredAt: answer.updatedAt.toISOString(),
    }));

  const answered = new Set(answers.map((answer) => answer.characterId));
  const everyoneIn = partyIds.length > 0 && partyIds.every((id) => answered.has(id));
  const hasActions = answers.some((answer) => !answer.waiting && answer.text.trim().length > 0);

  return {
    id: round.id,
    number: round.number,
    mode: round.mode as RoundMode,
    status: round.status as RoundStatus,
    stage: round.stage,
    error: round.error,
    retelling: round.retelling,
    correction: round.correction,
    familyMove: asFamilyMove(round.familyMove),
    partyIds,
    answers,
    waitingFor: partyIds.filter((id) => !answered.has(id)),
    everyoneIn,
    hasActions,
    startsItself: everyoneIn && hasActions && !round.retelling && round.error === null,
    claimedAt: round.claimedAt?.toISOString() ?? null,
  };
}

async function partyIdsOf(campaignId: string): Promise<string[]> {
  const party = await db.partyMember.findMany({
    where: { campaignId },
    orderBy: { position: "asc" },
    select: { characterId: true },
  });
  return party.map((member) => member.characterId);
}

/** The round in progress, or null when the party is between rounds. */
export async function currentRound(campaignId: string): Promise<RoundView | null> {
  const round = await db.turnRound.findFirst({
    where: { campaignId, status: { in: LIVE } },
    orderBy: { number: "desc" },
    include: { answers: true },
  });
  if (!round) return null;

  return view(round, await partyIdsOf(campaignId));
}

/**
 * Opens a round, or hands back the one that is already open.
 *
 * `seed` prefills answers, which is how a retelling works: the turn that was
 * taken back put everybody's words on the screen again, and only the correction
 * has to be typed.
 */
export async function openRound(
  campaignId: string,
  mode: RoundMode,
  options: { retelling?: boolean; seed?: { characterId: string; text: string }[] } = {},
): Promise<RoundView> {
  const partyIds = await partyIdsOf(campaignId);

  for (let attempt = 0; ; attempt += 1) {
    const existing = await db.turnRound.findFirst({
      where: { campaignId, status: { in: LIVE } },
      orderBy: { number: "desc" },
      include: { answers: true },
    });
    if (existing) return view(existing, partyIds);

    const last = await db.turnRound.findFirst({
      where: { campaignId },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    const seed = (options.seed ?? []).filter((answer) => partyIds.includes(answer.characterId));

    try {
      const created = await db.turnRound.create({
        data: {
          campaignId,
          number: (last?.number ?? 0) + 1,
          mode,
          retelling: options.retelling === true,
          answers: {
            create: seed.map((answer) => ({ characterId: answer.characterId, text: answer.text })),
          },
        },
        include: { answers: true },
      });
      return view(created, partyIds);
    } catch (error) {
      // Another device opened the round a moment ago. Go round again and use
      // theirs — which is the whole point of the unique constraint.
      if (attempt >= 3 || !isUniqueViolation(error)) throw error;
    }
  }
}

/** Records what one adventurer is doing. Replaces an earlier answer. */
export async function answerRound(
  roundId: string,
  answer: { characterId: string; userId: string; text: string; waiting: boolean },
): Promise<void> {
  const text = answer.waiting ? "" : answer.text.trim();

  await db.roundAnswer.upsert({
    where: { roundId_characterId: { roundId, characterId: answer.characterId } },
    create: {
      roundId,
      characterId: answer.characterId,
      userId: answer.userId,
      text,
      waiting: answer.waiting,
    },
    update: { userId: answer.userId, text, waiting: answer.waiting },
  });

  // An answer changing is the table's reply to whatever went wrong last time.
  await db.turnRound.update({ where: { id: roundId }, data: { error: null } });
}

/** Takes an answer back, so the round waits for it again. */
export async function withdrawAnswer(roundId: string, characterId: string): Promise<void> {
  await db.roundAnswer.deleteMany({ where: { roundId, characterId } });
}

/** Records what the table says the last telling got wrong. */
export async function setRoundCorrection(roundId: string, correction: string): Promise<void> {
  await db.turnRound.update({
    where: { id: roundId },
    data: { correction: correction.trim() || null },
  });
}

/** Sets or clears the Family Move the party is spending this round. */
export async function setRoundFamilyMove(
  roundId: string,
  move: FamilyMoveChoice | null,
): Promise<void> {
  await db.turnRound.update({
    where: { id: roundId },
    data: { familyMove: move === null ? Prisma.DbNull : (move as unknown as Prisma.InputJsonValue) },
  });
}

/** Abandons the round. Whatever was typed goes with it. */
export async function cancelRound(campaignId: string): Promise<void> {
  await db.turnRound.updateMany({
    where: { campaignId, status: { in: LIVE } },
    data: { status: "CANCELLED" },
  });
}

/**
 * Tries to become the browser that runs this turn.
 *
 * Conditional on the round still being collectable, so of several browsers that
 * notice "everyone is in" at the same moment, exactly one gets true back. A
 * claim that has gone stale — a laptop shut mid-turn — may be taken over, which
 * is the only way the table gets unstuck without an administrator.
 */
export async function claimRound(roundId: string, userId: string): Promise<boolean> {
  const stale = new Date(Date.now() - CLAIM_TIMEOUT_MS);

  const claimed = await db.turnRound.updateMany({
    where: {
      id: roundId,
      OR: [{ status: "COLLECTING" }, { status: "RESOLVING", claimedAt: { lt: stale } }],
    },
    data: { status: "RESOLVING", claimedById: userId, claimedAt: new Date(), stage: null, error: null },
  });

  return claimed.count === 1;
}

/** Reports how far along the turn is, for everyone else's screen. */
export async function recordStage(roundId: string, stage: string): Promise<void> {
  await db.turnRound
    .update({ where: { id: roundId }, data: { stage } })
    .catch(() => {
      // Progress is a courtesy. It must never be the reason a turn fails.
    });
}

/** The turn was taken; the transcript is the record from here on. */
export async function finishRound(roundId: string): Promise<void> {
  await db.turnRound.update({
    where: { id: roundId },
    data: { status: "RESOLVED", stage: null, error: null, resolvedAt: new Date() },
  });
}

/**
 * The turn failed. The round goes back to collecting with the reason attached.
 *
 * Losing four people's typing because a model server hiccuped would be a much
 * worse failure than the hiccup, so nothing is deleted: the table reads what
 * happened and presses the button again.
 */
export async function failRound(roundId: string, message: string): Promise<void> {
  await db.turnRound.update({
    where: { id: roundId },
    data: { status: "COLLECTING", stage: null, claimedById: null, claimedAt: null, error: message },
  });
}

/**
 * The answers, in turn order, shaped the way the turn pipeline wants them.
 *
 * Adventurers who waited and watched drop out here rather than being sent as
 * empty strings: the storyteller is told what happened, and "nothing" is not
 * something that happened.
 */
export function actionsFrom(round: RoundView): { characterId: string; text: string }[] {
  const byCharacter = new Map(round.answers.map((answer) => [answer.characterId, answer]));

  return round.partyIds
    .map((characterId) => ({ characterId, text: byCharacter.get(characterId)?.text.trim() ?? "" }))
    .filter((action) => action.text.length > 0);
}
