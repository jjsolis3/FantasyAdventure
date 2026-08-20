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
import { whatWouldCount } from "@/lib/game/finds";
import { STUCK_AFTER } from "@/lib/game/quests";

/** A turn as it comes back from any of the pages that build a briefing. */
type TurnLike = { metadata: Prisma.JsonValue | null };

/** A turn with enough on it to tell an attempt from a passage. */
type AttemptLike = TurnLike & { type: string; content: string; sceneId?: string };

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
  /** Somewhere worth going next, gathered across this scene. */
  leads: string[];
  /** What anybody has already tried this chapter, newest first. */
  tried: Attempt[];
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

/** How many attempts are worth listing. Beyond this it is a transcript. */
export const TRIED_LIMIT = 8;

/** One thing somebody had a go at, and whether it happened in the room they are in. */
export type Attempt = {
  text: string;
  /**
   * True when it was tried in the scene that is open now.
   *
   * Worth distinguishing rather than flattening. "We tried that just now" and
   * "we tried that two rooms ago" are different facts: the first is a reason not
   * to repeat yourself, the second is a reason to wonder whether it would work
   * *here*. Rolling them together would quietly tell a party that a door they
   * pushed on in the cellar is a door they have pushed on in the attic.
   */
  thisScene: boolean;
};

/**
 * What they have already tried in this chapter, in their own words.
 *
 * Three girls searching the same barn twice is most of what "aimless" actually
 * looks like from the sofa, and the fix needs no model and no schema: every
 * attempt anybody has typed is already a row, and nobody has ever been shown
 * them as a list.
 *
 * The transcript has them too, and that is not the same thing. A transcript is
 * a story to read; this is a checklist to scan — deduplicated, newest first, no
 * passages in between. The question it answers is "have we done this already?",
 * and answering that by scrolling back through four passages is why nobody does.
 *
 * ## Why it is no longer scene-scoped
 *
 * It was, for one round, and a sixteen-turn chapter is exactly what that misses.
 * A scene ends when the party *moves*, so a family going in circles for an
 * evening racks up several scenes — and the checklist emptied itself at every
 * one of them. The list a table needs at turn sixteen is the list of everything
 * they have had a go at since the chapter opened, which is the same span the
 * chapter's objectives are open across.
 *
 * A chapter and no further, for the same reason leads stop at a scene: a new
 * chapter is a new problem, and a checklist of things that did not work on the
 * last one is discouragement rather than information.
 *
 * Talking is left out. A conversation is not an attempt, and a girl who said
 * "I think we should go together" has not tried anything she could repeat by
 * mistake.
 */
export function alreadyTried(
  turns: AttemptLike[],
  /** The scene open right now, so "just now" can be told from "a while back". */
  currentSceneId: string | null = null,
  limit = TRIED_LIMIT,
): Attempt[] {
  const out: Attempt[] = [];
  const seen = new Set<string>();

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.type !== "PLAYER_ACTION") continue;
    if ((turn.metadata as { spoken?: boolean } | null)?.spoken === true) continue;

    const text = turn.content.trim();
    if (!text) continue;

    // Normalised only for the comparison. Two girls writing "I check the barn"
    // and "I check the barn!" have tried one thing, and the list should say so
    // — but it should say it in the words somebody actually typed.
    const key = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);

    // Newest first means the first time a repeated attempt is seen is its most
    // recent one, so the flag describes the last time they tried it — which is
    // the one somebody is about to repeat.
    out.push({
      text,
      thisScene: currentSceneId === null || turn.sceneId === undefined
        ? true
        : turn.sceneId === currentSceneId,
    });
    if (out.length === limit) break;
  }

  return out;
}

/**
 * The same checklist, for the storyteller.
 *
 * The half of this that the table never sees. A model handed "they are stuck"
 * reaches for the cheapest honest-looking way out, and one of the cheapest is to
 * point them back down a corridor they have already walked — which reads as a
 * hint, costs a turn, and teaches a family that the game is going in circles
 * because *they* are.
 *
 * So it is told plainly, and told what to do about it: these have been done,
 * they did not work, find them something else. Never a ban on the *place* — a
 * barn searched once may still be where the story goes — only on pretending an
 * attempt was never made.
 */
export function triedNote(attempts: Attempt[]): string {
  if (attempts.length === 0) return "";

  return (
    `THINGS THEY HAVE ALREADY TRIED THIS CHAPTER — do not send them back to these:\n` +
    attempts.map((attempt) => `- ${attempt.text}`).join("\n") +
    `\nEach of these has been done and did not settle anything. Do not have somebody ` +
    `suggest one of them, do not describe one as the obvious next move, and do not ` +
    `quietly make one work now that would not work before. If they try one again anyway, ` +
    `let it happen — but the story must move because of something new.`
  );
}

/** How many places are worth pointing at. Beyond this it is a map. */
export const LEADS_LIMIT = 3;

/**
 * Somewhere worth going next, gathered across the whole scene.
 *
 * Different from `tableFrom`, deliberately, and the difference is what a lead
 * is for. What is *on the table* belongs to one passage — pick the thing up or
 * it goes away. A lead is a door: mentioned three turns ago, still shut, still
 * worth walking through. So these accumulate across the scene rather than being
 * read off the newest passage that had any.
 *
 * Scene-scoped and no further. A new scene is a new room, and a signpost
 * pointing back at the last one is worse than no signpost.
 *
 * Newest first, because the newest is the one the story just made a case for.
 */
export function leadsFrom(turns: TurnLike[], limit = LEADS_LIMIT): string[] {
  const out: string[] = [];

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const meta = turns[index].metadata as { leads?: string[] } | null;
    if (!Array.isArray(meta?.leads)) continue;

    for (const lead of meta.leads) {
      if (typeof lead !== "string") continue;
      const text = lead.trim();
      if (!text) continue;
      // The storyteller is told to repeat a live lead, so the same door will
      // arrive several turns running. Once is enough.
      if (out.some((seen) => seen.toLocaleLowerCase() === text.toLocaleLowerCase())) continue;
      out.push(text);
      if (out.length === limit) return out;
    }
  }

  return out;
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

export type NeededObjective = {
  id: string;
  quest: string;
  text: string;
  kind: string;
  /**
   * Turns this has been outstanding, once that is a long time.
   *
   * Null while a party is working steadily. Saying "you have been after this
   * for sixteen turns" is not a hint — it is the game admitting it can see what
   * the family can see, and it is the difference between "we are exploring" and
   * "we are lost". See `stuckObjectives`.
   */
  stuckFor: number | null;
  /**
   * The words the matcher is actually looking for, for a FIND.
   *
   * Empty for a DEED, which nothing matches against — only the storyteller can
   * say a deed is done. See `whatWouldCount` for why saying this out loud is
   * telling a child the rules rather than giving her the answer.
   */
  counts: string[];
};

/**
 * What is still outstanding, in the players' own words.
 *
 * Shared quests only. A personal aim is hers until she chooses to say it, and
 * the television is the least private surface in the house — same rule as
 * `screenView`, for the same reason.
 */
export async function neededObjectives(
  campaignId: string,
  limit = 5,
  /** Where the adventure is now, so "how long has this been open" is answerable. */
  turnCounter = 0,
): Promise<NeededObjective[]> {
  const quests = await db.quest.findMany({
    where: { campaignId, status: "ACTIVE", secretForCharacterId: null },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      openedAtTurn: true,
      objectives: {
        orderBy: { position: "asc" },
        select: { id: true, text: true, kind: true, doneAtTurn: true },
      },
    },
  });

  const out: NeededObjective[] = [];
  for (const quest of quests) {
    // Only when nothing on this quest has moved. A party that has ticked one of
    // three is getting somewhere, and telling them otherwise would be both
    // wrong and discouraging.
    const untouched = quest.objectives.every((objective) => objective.doneAtTurn === null);
    const open = turnCounter - quest.openedAtTurn;
    const stuckFor = untouched && open >= STUCK_AFTER ? open : null;

    for (const objective of quest.objectives) {
      if (objective.doneAtTurn !== null) continue;
      out.push({
        id: objective.id,
        quest: quest.title,
        text: objective.text,
        kind: objective.kind,
        stuckFor,
        counts: objective.kind === "FIND" ? whatWouldCount(objective.text) : [],
      });
      if (out.length === limit) return out;
    }
  }
  return out;
}

/**
 * One girl's own aim, as she needs to read it while she is deciding what to do.
 *
 * The shape mirrors `NeededObjective` deliberately — same fields, same meanings —
 * because a child should not have to learn two ways of reading a goal depending
 * on whose it is.
 */
export type YourAim = {
  questId: string;
  title: string;
  summary: string;
  /** Whose it is. On a shared screen the parent owns several. */
  characterId: string;
  characterName: string;
  objectives: {
    id: string;
    text: string;
    kind: string;
    done: boolean;
    /** The words a FIND would actually accept — see `whatWouldCount`. */
    counts: string[];
  }[];
  /** Turns this has been outstanding, once that is a long time. */
  stuckFor: number | null;
};

/**
 * The aims belonging to whoever is looking, and nobody else's.
 *
 * ## The evening that made this necessary
 *
 * *"I was not able to complete my private quest, even after finding and even
 * crafting my own."* Two separate causes, and the previous round fixed the
 * mechanical one: an aim written as *"Craft the oversized wooden coffee mug and
 * successfully take the first morning sip from it"* was one row with two
 * conditions, so half of it could be finished invisibly and the row never
 * ticked. `splitObjective` deals with that.
 *
 * This is the other half, and it is not a bug so much as an omission. A personal
 * aim is generated at the top of a chapter, announced once in a passage, and
 * then lives entirely on the quest tab. `neededObjectives` — the list she
 * actually reads while typing — filters personal quests out, and correctly so:
 * that briefing also feeds the television, which is the least private surface in
 * the house.
 *
 * So the fix is not to relax that filter. It is a second, viewer-scoped loader
 * that never goes near the screen: hers, in her browser, beside the box she is
 * typing into.
 *
 * ## Whose
 *
 * By account rather than by character, matching `questBoard` exactly. On four
 * phones each girl gets her own; on one shared screen the parent owns every
 * adventurer and sees them all, which is what running the table needs.
 *
 * A viewer of `undefined` gets nothing at all — the safe way for a caller to be
 * wrong.
 */
export async function yourAims(
  campaignId: string,
  viewerUserId: string | undefined,
  /** Where the adventure is now, so "how long has this been open" is answerable. */
  turnCounter = 0,
): Promise<YourAim[]> {
  if (!viewerUserId) return [];

  const quests = await db.quest.findMany({
    where: {
      campaignId,
      kind: "PERSONAL",
      status: "ACTIVE",
      secretFor: { userId: viewerUserId },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      summary: true,
      openedAtTurn: true,
      secretForCharacterId: true,
      secretFor: { select: { name: true } },
      objectives: {
        orderBy: { position: "asc" },
        select: { id: true, text: true, kind: true, doneAtTurn: true },
      },
    },
  });

  return quests
    .filter((quest) => quest.secretForCharacterId !== null)
    .map((quest) => {
      // Same rule as the shared board: a party that has ticked one of three is
      // getting somewhere, and telling them otherwise is discouraging as well
      // as wrong.
      const untouched = quest.objectives.every((objective) => objective.doneAtTurn === null);
      const open = turnCounter - quest.openedAtTurn;

      return {
        questId: quest.id,
        title: quest.title,
        summary: quest.summary,
        characterId: quest.secretForCharacterId as string,
        characterName: quest.secretFor?.name ?? "somebody",
        objectives: quest.objectives.map((objective) => ({
          id: objective.id,
          text: objective.text,
          kind: objective.kind,
          done: objective.doneAtTurn !== null,
          counts:
            objective.kind === "FIND" && objective.doneAtTurn === null
              ? whatWouldCount(objective.text)
              : [],
        })),
        stuckFor: untouched && open >= STUCK_AFTER ? open : null,
      } satisfies YourAim;
    });
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
