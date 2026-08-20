/**
 * What actually changed in a chapter, as opposed to what was said in it.
 *
 * ## The complaint
 *
 * *"The recaps were very generic. It was just repeating what was said in the
 * passage."* Exactly right, and the reason is structural rather than a matter
 * of prompt wording: `summaryPrompt` is handed a transcript and asked to
 * summarise it. A model handed prose and asked for shorter prose returns
 * shorter prose. It has no way to know that finding the album was the only
 * thing in that scene that will still matter next week.
 *
 * ## Where the answer already was
 *
 * The game has been writing down what changed since the first evening, in
 * family-facing English, and filing it in the same place as the story: every
 * milestone — *Mira is now carrying the brass key*, *Mira and Rowan grew
 * closer*, *Rowan reached level 2*, *The Hollow Man is in front of them now* —
 * is a `SYSTEM` turn event on the scene it happened in.
 *
 * So a recap of what happened does not need a model, a schema or a new column.
 * It needs somebody to read the rows.
 *
 * ## Two recaps, not one
 *
 * The prose summary stays, because the storyteller needs prose: it is what a
 * closed scene becomes in the prompt, and a list of milestones would make a
 * poor memory of an evening. What is added is the ledger beside it — for the
 * family, and for the summariser itself, which now gets told what mattered
 * instead of being asked to guess.
 */

import { db } from "@/lib/db";
import { isClockEvent } from "@/lib/game/clock-log";

export type SceneRecap = {
  sceneId: string;
  title: string;
  /** The storyteller's prose, unchanged. */
  summary: string | null;
  /** What changed, in the words the game already used at the time. */
  changed: string[];
  /** Dice thrown in this chapter, and how many landed. */
  rolls: { thrown: number; landed: number };
};

/** How many changes are worth listing. Beyond this it is a ledger. */
export const CHANGED_LIMIT = 6;

/**
 * Which milestones are worth putting in a recap.
 *
 * Not all of them. "Mira used Step In" is worth saying at the time — it is the
 * table watching somebody spend something — and worth nothing a week later. A
 * recap answers "where were we", so it keeps what is still true: what they got,
 * what they finished, who grew, what turned up.
 *
 * Matched on the sentence rather than on a type, because the milestones were
 * written as sentences long before anybody wanted to sort them. Adding a kind
 * column now would mean either a backfill that guesses at old rows or a recap
 * that is empty for every evening already played.
 */
const FORGETTABLE = [/\bused\b.*\.$/i, /can now use .* together/i];

/**
 * Exported so the milestones that must survive can be guarded by name.
 *
 * The filter is a pattern match on a sentence, which means any milestone
 * reworded into the shape of a spend would quietly stop reaching recaps — and
 * quietly is the problem. An encounter ending is the one most worth pinning
 * down: it is the biggest thing that happens in a chapter and the easiest to
 * word as *"the Hollow Man used its last trick."*, which this would drop.
 */
export function worthKeeping(line: string): boolean {
  // The Family Move unlock is the one exception to the "used" rule above: it is
  // phrased like a spend and is in fact a permanent thing they now have. It
  // gets its own place in the pair card, so it is dropped from here to leave
  // room for what is not recorded anywhere else.
  return !FORGETTABLE.some((pattern) => pattern.test(line));
}

/**
 * One chapter, read back off its own rows.
 *
 * Scene-scoped throughout, which is what makes it exact: a milestone is written
 * onto the scene it happened in, so there is no arithmetic on turn counters and
 * no way for two chapters to claim the same discovery.
 */
export async function recapFor(scene: {
  id: string;
  title: string;
  summary: string | null;
}): Promise<SceneRecap> {
  const [system, dice] = await Promise.all([
    db.turnEvent.findMany({
      where: { sceneId: scene.id, type: "SYSTEM" },
      orderBy: { ordinal: "asc" },
      select: { content: true, metadata: true },
    }),
    db.turnEvent.findMany({
      where: { sceneId: scene.id, type: "DICE_ROLL" },
      select: { metadata: true },
    }),
  ]);

  const changed: string[] = [];
  for (const event of system) {
    // The clock's own receipts share this table and are not milestones. Six
    // notches would crowd out the six things that are still true tomorrow,
    // which is the one job a recap has. They have their own history, next to
    // the clock, where they mean something — see `lib/game/clock-log.ts`.
    if (isClockEvent(event.metadata)) continue;

    const line = event.content.trim();
    if (!line || !worthKeeping(line)) continue;
    if (changed.includes(line)) continue;
    changed.push(line);
    if (changed.length === CHANGED_LIMIT) break;
  }

  let landed = 0;
  for (const roll of dice) {
    const outcome = (roll.metadata as { outcome?: string } | null)?.outcome;
    if (outcome === "SUCCESS" || outcome === "CRITICAL") landed += 1;
  }

  return {
    sceneId: scene.id,
    title: scene.title,
    summary: scene.summary,
    changed,
    rolls: { thrown: dice.length, landed },
  };
}

/** Every closed chapter, oldest first. */
export async function recapsFor(
  scenes: { id: string; title: string; summary: string | null }[],
): Promise<SceneRecap[]> {
  return Promise.all(scenes.map((scene) => recapFor(scene)));
}

export type ChapterCard = {
  /** The chapter that just finished. */
  index: number;
  title: string;
  /** What they did, gathered across every scene of it. */
  did: string[];
  /** Dice across the whole chapter. */
  rolls: { thrown: number; landed: number };
  /** What they are carrying into the next one. */
  carrying: { name: string; items: string[] }[];
  /** What the next one is called, when there is one. */
  next: { index: number; title: string } | null;
};

/** How much of a chapter is worth putting on one card. */
const CARD_LIMIT = 8;

/**
 * The card a family gets when a chapter turns.
 *
 * A chapter used to end silently, mid-scroll: the act index changed, the header
 * said "Chapter 2", and nothing marked the moment. For a family playing on a
 * school night that is the single most useful thing the game could put on the
 * screen — it is the natural place to stop, and without it an evening ends
 * whenever somebody gets tired rather than at an ending.
 *
 * Shown for the whole of the new chapter's first scene rather than for one
 * render, so nobody misses it by refreshing, and so the parent who was in the
 * kitchen can still read what happened.
 *
 * Everything on it is read back rather than stored. A card written at the
 * moment would be a snapshot that a taken-back turn could make into a lie.
 */
export async function chapterCard(input: {
  campaignId: string;
  /** The act that has just finished — the one before the current index. */
  finishedIndex: number;
  finishedTitle: string;
  next: { index: number; title: string } | null;
  party: { characterId: string; name: string }[];
}): Promise<ChapterCard | null> {
  const scenes = await db.scene.findMany({
    where: { campaignId: input.campaignId, actIndex: input.finishedIndex },
    orderBy: { index: "asc" },
    select: { id: true, title: true, summary: true },
  });
  if (scenes.length === 0) return null;

  const recaps = await recapsFor(scenes);

  const did: string[] = [];
  for (const recap of recaps) {
    for (const line of recap.changed) {
      if (did.includes(line)) continue;
      did.push(line);
      if (did.length === CARD_LIMIT) break;
    }
    if (did.length === CARD_LIMIT) break;
  }

  const rolls = recaps.reduce(
    (sum, recap) => ({
      thrown: sum.thrown + recap.rolls.thrown,
      landed: sum.landed + recap.rolls.landed,
    }),
    { thrown: 0, landed: 0 },
  );

  // Only what this adventure gave them. A rope from home is not a trophy, and a
  // card about a chapter should not list somebody's whole pack.
  const items = await db.inventoryItem.findMany({
    where: {
      characterId: { in: input.party.map((member) => member.characterId) },
      foundInCampaignId: input.campaignId,
    },
    orderBy: { name: "asc" },
    select: { characterId: true, name: true, quantity: true },
  });

  const carrying = input.party
    .map((member) => ({
      name: member.name,
      items: items
        .filter((item) => item.characterId === member.characterId)
        .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)),
    }))
    .filter((entry) => entry.items.length > 0);

  return {
    index: input.finishedIndex,
    title: input.finishedTitle,
    did,
    rolls,
    carrying,
    next: input.next,
  };
}

/**
 * The same ledger, as a line for the summariser.
 *
 * Handed to `summaryPrompt` so the model stops guessing at what mattered. It is
 * the cheapest possible fix for a generic summary: the model was never told
 * which two sentences of eight hundred words were the ones that changed
 * anything.
 */
export function ledgerLine(changed: string[]): string {
  if (changed.length === 0) return "";
  return changed.map((line) => `- ${line}`).join("\n");
}
