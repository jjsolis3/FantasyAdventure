/**
 * Real dice, on a real table.
 *
 * The girls each own a set, and until now the app rolled for them. This is the
 * change that puts the die back in their hands: the storyteller asks, somebody
 * picks up their d20, everybody watches it land, and the number gets typed in.
 *
 * ## The one thing this gives up, deliberately
 *
 * *"The server rolls, never the model"* is the oldest rule in this codebase, and
 * it exists so the fiction cannot cheat. Typed dice hand that power to the
 * players, who very much can.
 *
 * That is the correct trade for a family at one table. A physical die is a
 * social contract enforced by everybody who can see it, which is a stronger
 * guarantee than software has ever managed — and a game between people who
 * cannot trust each other is not worth automating. So the number is entered in
 * the open, shown to the whole table and put on the television, exactly as it
 * would be at any other game night.
 *
 * What the app keeps is the arithmetic. She rolls a 14 and types 14; the game
 * adds her stat, her skill, her knacks, whatever a shared plan is worth, and
 * then asks Luck. That is the right division of labour for a nine-year-old: she
 * gets the part with the clatter, and nobody has to add up seven modifiers
 * while everyone waits.
 *
 * ## What is still the server's to roll
 *
 * Exactly one thing, and it is not hers. Luck's nudge asks whether the *world*
 * happened to oblige, and a girl rolling to find out whether she got lucky
 * would know she got lucky, which is the one way to spoil it. It stays hidden.
 *
 * There is nothing else. This game has no monster attacks, no saving throws and
 * no initiative — every roll in it comes from something a player chose to try,
 * so every roll in it is now theirs.
 */

/** The only die this game has ever used. */
export const TABLE_DIE = 20;

export type DiceMode =
  /** The app rolls, as it always has. Right when the dice are in another room. */
  | "SERVER"
  /** The table rolls and types the number in. */
  | "TABLE";

/** One roll the table owes before the turn can go on. */
export type AwaitedRoll = {
  /** Position in the adjudication's check list — how a typed number finds its check. */
  index: number;
  characterId: string;
  characterName: string;
  /** What she is trying to do, in the storyteller's words. */
  intent: string;
  /** Which stat this is, so the sheet can be checked before the die is thrown. */
  stat: string;
  difficulty: string;
};

export type RollEntry = { index: number; value: number };

export type RollCheck = { ok: true; values: number[] } | { ok: false; reason: string };

/**
 * Checks what was typed against what was asked for.
 *
 * Every rule here is a way a table gets this wrong by accident rather than on
 * purpose — a fat-fingered 200, a d6 grabbed instead of a d20, one girl's entry
 * arriving twice because she pressed send on two phones. Cheating is not what
 * this guards against; that is what the other people in the room are for.
 */
export function checkRolls(awaited: AwaitedRoll[], entries: RollEntry[]): RollCheck {
  if (awaited.length === 0) return { ok: false, reason: "Nothing is waiting on a roll." };

  const byIndex = new Map<number, number>();

  for (const entry of entries) {
    const roll = awaited.find((wanted) => wanted.index === entry.index);
    if (!roll) return { ok: false, reason: "That roll is not one the story is waiting for." };

    if (!Number.isInteger(entry.value)) {
      return { ok: false, reason: "A die shows a whole number." };
    }
    if (entry.value < 1 || entry.value > TABLE_DIE) {
      return {
        ok: false,
        reason: `A d${TABLE_DIE} shows 1 to ${TABLE_DIE}. Did you pick up the right one?`,
      };
    }
    // Last one wins rather than erroring: somebody correcting a typo should not
    // have to be told off for it.
    byIndex.set(entry.index, entry.value);
  }

  const missing = awaited.filter((roll) => !byIndex.has(roll.index));
  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        missing.length === 1
          ? `Still waiting on ${missing[0].characterName}.`
          : `Still waiting on ${missing.map((roll) => roll.characterName).join(", ")}.`,
    };
  }

  // Ordered by the index the adjudication gave them, because that is the order
  // the pipeline will ask for them in — and a roller that hands out the right
  // numbers in the wrong order is the worst possible bug here: every check
  // resolves, nothing errors, and the girl who rolled a 19 watches somebody
  // else succeed with it.
  return {
    ok: true,
    values: [...awaited]
      .sort((a, b) => a.index - b.index)
      .map((roll) => byIndex.get(roll.index)!),
  };
}

/**
 * A roller that hands out the numbers the table typed, in order.
 *
 * Slots straight into the pipeline's existing injectable roller, which is why
 * this whole feature needs no change at all to how a check is resolved: the
 * dice do not care where a number came from, and every modifier, skill, shared
 * plan and lucky break applies exactly as it did.
 *
 * Falls back to the server's own die if the pipeline asks for more numbers than
 * were typed. That should be impossible — the checks were counted before the
 * table was asked — but "impossible" here would mean a turn dying halfway
 * through with four people watching, and an unexpected fair roll is a far
 * better outcome than a crash.
 */
export function rollerFrom(values: number[], fallback: () => number): () => number {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    return next ?? fallback();
  };
}
