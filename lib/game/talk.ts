/**
 * The game asking them to talk to each other.
 *
 * ## What was wrong
 *
 * *Talk to each other* has always been there, sat next to *What do you do?* as
 * the smaller, greyer, second button. Everything about the screen said it was
 * the lesser option: no dice, no roll, "the story stays where it is". A family
 * read that as *nothing happens*, and in a whole recorded evening they pressed
 * it once.
 *
 * That is a shame twice over. It is the only round that earns a bond without
 * anybody having to succeed at anything, and it is the round where three
 * children who have been "reading three separate stories at the same time"
 * actually get to agree on one. The mechanic was built, wired up, tested — and
 * then left to be discovered by a nine-year-old, at a moment when she was busy
 * deciding what to do about a locked door.
 *
 * ## What this does
 *
 * Two things, and neither invents anything the game did not already know.
 *
 * 1. **It asks.** At the moments a table would naturally stop and confer — a
 *    scene just opened, something is standing in front of them, the clock is
 *    running down — the game says so, in one line, next to the button.
 * 2. **It says what it was worth.** Bonds deepened quietly: unless a
 *    conversation happened to cross a Family Move threshold, nothing was ever
 *    printed. Now every deepening says so. See `closerMessage` in
 *    `lib/game/rules.ts`.
 *
 * ## What it is not
 *
 * It is not a hint and it never says what to talk about. "Something is standing
 * in front of you" is a fact already on their screen; "ask Rowan what she saw
 * in the cellar" would be the game playing itself. The line points at the
 * button, never at the answer.
 */

import { db } from "@/lib/db";

/** A turn as it comes off the current scene. */
type TurnLike = { type: string; metadata: unknown };

export type TalkMoment = {
  /**
   * Which moment fired. Tested against rather than the prose, so the wording
   * can be read aloud to a ten-year-old and changed on her say-so without
   * breaking anything.
   */
  key: "encounter" | "opening" | "clock" | "quiet";
  /** The line shown beside the button. One sentence, no instructions. */
  reason: string;
};

/**
 * How long since anybody said anything to anybody.
 *
 * Counted in passages rather than in rounds, because a passage is what the
 * table actually watches go by. A conversation leaves `spoken` player actions
 * behind it, so the count is simply the narrations that have landed since the
 * last one of those.
 *
 * Scene-scoped, and that is the right scope: a new scene is a new room, and
 * whatever they agreed in the last one has usually stopped being the question.
 */
export function turnsSinceTalking(turns: TurnLike[]): number {
  let narrations = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    // A conversation writes its own passage after the words, so walking
    // backwards always crosses one narration that *is* the conversation. Not
    // discounting it made a table that had just finished talking read as one
    // passage stale, which is a silly thing for the game to think.
    if ((turn.metadata as { spoken?: boolean } | null)?.spoken === true) {
      return Math.max(0, narrations - 1);
    }
    if (turn.type === "NARRATION") narrations += 1;
  }
  return narrations;
}

/**
 * The same two numbers, for a surface that has not loaded the scene.
 *
 * The television fetches only narrations — it has no use for the rest — so it
 * cannot count conversations the way the play page can. Two counts rather than
 * one fetch, which is the cheaper half of that trade at any scene length.
 */
export async function passageCounts(
  sceneId: string | null,
): Promise<{ passages: number; sinceTalking: number }> {
  if (!sceneId) return { passages: 0, sinceTalking: 0 };

  const lastSpoken = await db.turnEvent.findFirst({
    where: { sceneId, type: "PLAYER_ACTION", metadata: { path: ["spoken"], equals: true } },
    orderBy: { ordinal: "desc" },
    select: { ordinal: true },
  });

  const [passages, after] = await Promise.all([
    db.turnEvent.count({ where: { sceneId, type: "NARRATION" } }),
    db.turnEvent.count({
      where: { sceneId, type: "NARRATION", ordinal: { gt: lastSpoken?.ordinal ?? -1 } },
    }),
  ]);

  // The conversation's own passage, discounted — same reasoning as
  // `turnsSinceTalking`, and the two must agree or a television and a phone
  // will disagree about whether the table has spoken.
  return { passages, sinceTalking: lastSpoken ? Math.max(0, after - 1) : after };
}

/** Quiet for this many passages and the game speaks up on its own. */
export const QUIET_PASSAGES = 4;

/**
 * The one moment worth mentioning right now, or nothing at all.
 *
 * Ordered by how much a conversation would change what happens next, and only
 * ever one of them. Four suggestions stacked up is a wall of advice, and the
 * point of this is a single quiet line that a child can ignore.
 *
 * Returning null most of the time is intended. A party that talks on its own,
 * or is three passages into a chase, should never be tapped on the shoulder.
 */
export function talkNudge(input: {
  /** What is standing in front of them, if anything. */
  encounterName: string | null;
  /** True while somebody has already said they have this one alone. */
  soloed: boolean;
  /** Passages since the last conversation, from `turnsSinceTalking`. */
  sinceTalking: number;
  /** Narrations in this scene. One means the opening passage is still on screen. */
  passages: number;
  /** Where the pressure clock stands. */
  clock: { level: number; limit: number; owed: boolean };
}): TalkMoment | null {
  // Nothing to confer about before the story has said anything.
  if (input.passages === 0) return null;

  // Something is there and nobody has claimed it. The single best moment in the
  // game to stop and agree on one plan, and — going by the transcript — the one
  // most likely to be met with three children trying three different things.
  if (input.encounterName && !input.soloed) {
    return {
      key: "encounter",
      reason: `${input.encounterName} is right in front of you. Worth a word before anybody tries anything?`,
    };
  }

  // The clock is the story pushing back, and the honest response to being
  // pushed is to decide together what actually matters. Only near the end: a
  // clock at one of eight is noise.
  if (input.clock.owed || input.clock.level >= input.clock.limit - 1) {
    return {
      key: "clock",
      reason: "The clock is nearly out. Agree on one thing to do with the time you have left.",
    };
  }

  // A room they have just walked into, before anybody has tried anything in it.
  if (input.passages === 1) {
    return {
      key: "opening",
      reason: "New scene. Say what you make of it before you start pulling on things.",
    };
  }

  if (input.sinceTalking >= QUIET_PASSAGES) {
    return {
      key: "quiet",
      reason: "You have not said a word to each other in a while. Talking costs you nothing.",
    };
  }

  return null;
}
