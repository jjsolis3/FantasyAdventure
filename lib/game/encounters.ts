/**
 * Something standing in front of them.
 *
 * The one shape this game was missing. Everything else here answers a question
 * the players asked — they try something, the dice decide, the story replies. An
 * encounter is the world asking a question back: she opened a door, and there is
 * somebody behind it who is already angry, and now what?
 *
 * ## Fighting with words
 *
 * There is no combat in this game and there never will be. So an encounter is
 * not a thing to be beaten — it is a person or a predicament with a **want**,
 * and the whole of it is working out what that want is and what to do about it.
 * Admit it. Ask what happened. Offer something. Be funny. Tell the truth when a
 * lie would be easier. Or leave, and wear what leaving costs.
 *
 * That last one matters more than it looks: **every encounter has a way out**.
 * A child who is genuinely frightened must always be able to go, and going is a
 * decision rather than a defeat.
 *
 * ## One track, two directions
 *
 * Deliberately the act clock again, at a smaller scale, because the girls have
 * already learned to read one. The difference is that this one moves both ways:
 *
 *      it turns  ◄────────●────────►  they are through
 *                −3       0       +3
 *
 * Their successes push right. Its own roll pushes left. Both ends are an
 * ending, and neither is a loss — reaching the left means the situation *turns*
 * and the story carries on from somewhere worse, exactly as a full act clock
 * does.
 *
 * One bar, two ends, no hit points. A nine-year-old reads it at a glance.
 */

import { randomInt } from "node:crypto";

/** What kind of thing they have run into. */
export type EncounterKind =
  /** Somebody who wants something. Most of them. */
  | "PERSON"
  /** A predicament — a locked cellar, a rising tide, a room with no handle. */
  | "TRAP"
  /** A thing to be worked out rather than talked to. */
  | "PUZZLE";

/**
 * How far either way it runs.
 *
 * Three, which is two good rounds or three ordinary ones. Long enough to be a
 * scene with a shape rather than a single roll, short enough that a table does
 * not spend an evening in one doorway.
 */
export const ENCOUNTER_REACH = 3;

/**
 * What resolving one is worth.
 *
 * Between a side quest (4) and a personal one (6), because that is honestly
 * where an encounter sits: harder than an errand, smaller than the thing that
 * was hers alone.
 */
export const ENCOUNTER_XP = 5;

/**
 * What the girl who took it on by herself gets instead.
 *
 * Double, and she gives up a great deal for it — see `payoutFor`. This is the
 * whole of the independent child's bargain: more for her, and nothing for
 * anybody else, at worse odds.
 */
export const SOLO_MULTIPLIER = 2;

export type EncounterState = {
  /** −REACH to +REACH. Zero is where it starts. */
  ground: number;
  /** Nothing more to do: they got through, or it turned. */
  over: "THROUGH" | "TURNED" | null;
};

export function encounterAt(ground: number, rounds = 0): EncounterState {
  const clamped = Math.max(-ENCOUNTER_REACH, Math.min(ENCOUNTER_REACH, ground));

  if (clamped >= ENCOUNTER_REACH) return { ground: clamped, over: "THROUGH" };
  if (clamped <= -ENCOUNTER_REACH) return { ground: clamped, over: "TURNED" };

  // Out of patience. Goes to whoever is ahead, and a tie goes to the party —
  // they have been at this for five rounds and have earned the benefit of the
  // doubt. A standoff that never ends is the one outcome worse than either
  // ending.
  if (rounds >= ENCOUNTER_PATIENCE) {
    return { ground: clamped, over: clamped >= 0 ? "THROUGH" : "TURNED" };
  }

  return { ground: clamped, over: null };
}

/**
 * How hard this one pushes back.
 *
 * Its own rating rather than a difficulty band, because an encounter is not a
 * task — the same angry customer is exactly as angry whether she tries to talk
 * to him or to sneak past.
 */
export const NERVE = { CALM: 6, TENSE: 11, FIERCE: 15 } as const;
export type NerveKey = keyof typeof NERVE;

/**
 * How many rounds one is allowed to go on for.
 *
 * Found by driving one end to end: with the party gaining about one success a
 * round and the encounter pressing about as often, the track sat between −1 and
 * +1 for nine rounds and showed no sign of ever stopping. A standoff that can
 * last forever is not tense, it is a treadmill — and it is the exact thing a
 * real person running a game would never allow.
 *
 * So it ends. After this many rounds it goes to whoever is ahead, and a tie
 * goes to the party, because the girls have been trying for five rounds and the
 * door should open for them rather than on a technicality.
 */
export const ENCOUNTER_PATIENCE = 5;

export type WorldRoll = {
  roll: number;
  nerve: number;
  /** How much ground it took. Never negative — it cannot help them. */
  pressed: number;
  /** What the table is shown, in its own voice. */
  note: string;
};

/**
 * The encounter's own roll — the one the world makes.
 *
 * Kept on the server even when the family is throwing their own dice, and that
 * is not an oversight. Their die is theirs; this one is nobody's. A parent
 * rolling on behalf of the angry customer would be playing against their own
 * children, and a child rolling it would know what was coming.
 *
 * It is *shown*, though, and loudly. A visible roll landing against them is the
 * whole drama of an opposed check, and it is the closest this game comes to the
 * moment everybody at a D&D table leans in for — with nothing being attacked.
 *
 * It can only ever press. An encounter that rolled badly enough to *help* would
 * be a strange thing to explain, and it would take the sting out of the good
 * rounds.
 */
export function worldRoll(nerve: number, roller: () => number = () => randomInt(1, 21)): WorldRoll {
  const roll = roller();

  // Tuned by watching one run rather than by arithmetic on paper. The first
  // version had TENSE pressing on *every* roll and pressing twice on more than
  // half of them, which meant a party gaining a success a round went precisely
  // nowhere. It has to push back hard enough to be frightening and rarely
  // enough to be beatable.
  //
  // CALM presses only on a 20; TENSE on 15 and up; FIERCE on 11 and up, twice
  // on 16.
  const threshold = 26 - nerve;
  const pressed = roll >= threshold + 5 ? 2 : roll >= threshold ? 1 : 0;
  const note =
    pressed === 2
      ? "It gets much worse."
      : pressed === 1
        ? "It presses."
        : "It gives them a moment.";

  return { roll, nerve, pressed, note };
}

/**
 * Where the ground ends up after one round.
 *
 * Their successes minus what it pressed, and stated in one line because that is
 * how it should be readable at the table: *we got two, it took one, we are one
 * up.* Anything more clever than subtraction would be something a ten-year-old
 * has to be talked through.
 *
 * A critical is worth two. It is the only place in this game where a natural 20
 * does something arithmetical rather than narrative, and it earns that here —
 * one brilliant idea genuinely should end a standoff faster.
 */
export function groundAfter(options: {
  ground: number;
  outcomes: string[];
  pressed: number;
}): number {
  const gained = options.outcomes.reduce((total, outcome) => {
    if (outcome === "CRITICAL") return total + 2;
    if (outcome === "SUCCESS") return total + 1;
    // A partial is a real thing that happened and it is not progress out of a
    // standoff. It costs nothing either — she tried, and trying is never
    // charged for in this game.
    return total;
  }, 0);

  return Math.max(
    -ENCOUNTER_REACH,
    Math.min(ENCOUNTER_REACH, options.ground + gained - options.pressed),
  );
}

export type Payout = {
  /** Character ids and what each of them earns. */
  shares: { characterId: string; xp: number }[];
  /** Pairs who should each deepen a bond. Empty when somebody went it alone. */
  bondPairs: [string, string][];
  /** What the table is told, in a sentence. */
  note: string;
};

/**
 * What getting through one is worth, and to whom.
 *
 * The decision this whole feature is built around, and it has to be a genuine
 * fork rather than a right answer with a decoy beside it:
 *
 *   - **Alone** — double experience, to her, and nothing to anybody else. No
 *     bond. And it was *harder*, because a shared plan's help was refused: she
 *     took worse odds for a bigger prize, which is the entire bargain.
 *   - **Together** — the same pot split between everybody who helped, plus a
 *     bond for every pair of them.
 *
 * Neither is better and that is the point. Experience is what she gets tonight;
 * bonds are what the pair of them get for the rest of the game, because bonds
 * are what Family Moves are made of. The independent child levels faster and
 * ends up with a thinner sheet; the one who asks for help levels slower and can
 * do things alone-her cannot. Both children are right about themselves, and the
 * game never once says which to be.
 *
 * Split with the remainder shared out rather than dropped, so three girls
 * splitting five never see somebody get less for being third in a list.
 */
export function payoutFor(options: {
  helpers: string[];
  solo: boolean;
  soloCharacterId?: string | null;
}): Payout {
  if (options.solo && options.soloCharacterId) {
    return {
      shares: [{ characterId: options.soloCharacterId, xp: ENCOUNTER_XP * SOLO_MULTIPLIER }],
      bondPairs: [],
      note: "handled it alone",
    };
  }

  const helpers = [...new Set(options.helpers)];
  if (helpers.length === 0) return { shares: [], bondPairs: [], note: "" };
  if (helpers.length === 1) {
    // One girl acted, but never said she was taking it on. She is not paid the
    // solo prize for a choice she did not make — that would hand the bigger
    // reward to whoever happened to be quickest, and turn a shared game into a
    // race to answer first.
    return { shares: [{ characterId: helpers[0], xp: ENCOUNTER_XP }], bondPairs: [], note: "" };
  }

  const base = Math.floor(ENCOUNTER_XP / helpers.length);
  const spare = ENCOUNTER_XP % helpers.length;

  const bondPairs: [string, string][] = [];
  for (let i = 0; i < helpers.length; i += 1) {
    for (let j = i + 1; j < helpers.length; j += 1) bondPairs.push([helpers[i], helpers[j]]);
  }

  return {
    shares: helpers.map((characterId, index) => ({
      characterId,
      // The remainder goes to the first few rather than nowhere. Five between
      // two is three and two, not two and two with one quietly binned.
      xp: base + (index < spare ? 1 : 0),
    })),
    bondPairs,
    note: "got through it together",
  };
}

export type EncounterView = {
  name: string;
  want: string;
  kind: EncounterKind;
  /** What tends to work, in the storyteller's words. */
  works: string[];
  /** What makes it worse. */
  backfires: string[];
  /** How to leave, and what leaving costs. */
  wayOut: string;
  ground: number;
  soloName?: string | null;
};

/**
 * What the storyteller is told while one is open.
 *
 * Written as the situation rather than as rules, because the model has to
 * *narrate* this and a table of numbers narrates badly. The one instruction
 * that matters is the last: it must not resolve the thing on the party's behalf,
 * which is the same rule the act clock carries and for the same reason.
 */
export function encounterGuidance(view: EncounterView): string {
  const state = encounterAt(view.ground);

  const standing =
    state.ground > 0
      ? `The party is ${state.ground} ahead — this is going their way.`
      : state.ground < 0
        ? `It is ${Math.abs(state.ground)} against them — this is going badly.`
        : "Neither side has the upper hand yet.";

  return [
    `IN FRONT OF THEM RIGHT NOW — ${view.name.toUpperCase()}`,
    `What it wants: ${view.want}`,
    view.works.length ? `What tends to work: ${view.works.join("; ")}` : "",
    view.backfires.length ? `What makes it worse: ${view.backfires.join("; ")}` : "",
    `The way out, if they take it: ${view.wayOut}`,
    standing,
    view.soloName ? `${view.soloName} has said she is handling this one herself.` : "",
    "",
    "Narrate this as a situation that is still happening, not one that is over.",
    "It pushes back. It has its own mood and its own reasons, and it does not simply",
    "wait politely while they try things. Nobody is hurt and nothing is fought:",
    "this is settled with words, wit, honesty, kindness or a good exit.",
    "Do NOT resolve it for them, and do not have it give up on its own.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** What the table is told when one ends, either way. */
export function endingNote(name: string, over: "THROUGH" | "TURNED"): string {
  return over === "THROUGH"
    ? `${name}: they got through it.`
    : `${name}: it turned, and the story goes on from somewhere worse.`;
}

/**
 * How hungry the story is, right now, for something to stand in front of them.
 *
 * The instruction the extractor used to carry was one sentence, and it was
 * tuned for a cosy evening: *"almost every turn is null, and null is the right
 * answer."* A family then played ten turns of SPOOKY — a faceless figure one row
 * nearer in every photograph, a hand pressed flat behind the flour sacks, a
 * step in the hall that was not anybody's — and not one encounter opened. The
 * whole system sat there while the exact story it was built for went past it.
 *
 * So the appetite now depends on three things:
 *
 *   - **What the table asked for.** A household that chose SPOOKY or
 *     ADVENTUROUS wants to be made to deal with something. A COZY one does not,
 *     and the old wording is still exactly right for them.
 *   - **Whether one is already there.** Never two at once — that is a corridor
 *     of obstacles rather than a story, and it is the failure this guards
 *     against in the other direction.
 *   - **How long it has been.** Appetite grows with the quiet. Just after one
 *     resolves, the story should be allowed to breathe.
 *
 * Returned as a sentence rather than a number because its only reader is a
 * language model, and "you have been quiet for six turns" lands harder on a 7B
 * than a threshold ever will.
 */
export function encounterAppetite(options: {
  tone: string;
  /** True while something is already standing in front of them. */
  standing: boolean;
  /** Turns since the last one ended. Null when there has never been one. */
  since: number | null;
}): string {
  if (options.standing) {
    return (
      "Something is ALREADY standing in front of them, so encounterOpened must be null. " +
      "Two at once is a corridor of obstacles rather than a story."
    );
  }

  if (options.tone === "COZY") {
    return (
      "This table asked for a gentle evening. Almost every turn is null, and null is the " +
      "right answer unless the passage genuinely leaves them facing something."
    );
  }

  // Long enough to have been noticed. Four turns is roughly a scene, and a
  // scene in which nothing ever pushed back is the thing being fixed.
  const quiet = options.since === null || options.since >= 4;

  if (!quiet) {
    return (
      "Something was in front of them recently, so let the story breathe. Null unless " +
      "the passage clearly leaves them facing a new one."
    );
  }

  const asked =
    options.tone === "SPOOKY"
      ? "This table asked to be frightened"
      : "This table asked for real tension";

  return (
    `${asked}, and nothing has stood in their way for a while. If this passage leaves them ` +
    "facing something that will still be there next turn — a door that will not open, " +
    "somebody who will not let them past, a thing that wants something — OPEN IT. It does " +
    "not have to be a person and it does not have to be angry; a room, a rule or a bargain " +
    "counts. A frightening story where nothing ever stands in front of them is a haunted " +
    "tour, not a game. Still null if the passage genuinely leaves them facing nothing."
  );
}
