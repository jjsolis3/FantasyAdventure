/**
 * Knacks — what levelling up finally buys.
 *
 * Reaching a level used to be announced and then read by nothing at all. The
 * number went up, the table was told, and not one thing about the character
 * changed. This is what a level is for now: one Knack, chosen from three.
 *
 * Two rules shape the whole design.
 *
 * **The three offered are earned, not browsed.** They are drawn from what this
 * character actually did — the stats she keeps rolling, the things she keeps
 * trying — so two girls who levelled on the same evening are offered different
 * things, and nobody has to read a wiki to find the good build. This is the
 * Fallout feeling without the Fallout homework.
 *
 * **None of them is a trap.** Every knack is useful; none is strictly better
 * than another. A seven-year-old cannot make a choice here that she will regret
 * in four sessions, because there is no wrong one to make.
 *
 * A knack is also, wherever possible, a thing the *player* gets to do rather
 * than a number that quietly goes up. "Ask the storyteller one true thing" is
 * remembered; "+1 to Wits" is not.
 */

import type { StatKey } from "@/lib/game/rules";

/**
 * What a knack does, mechanically.
 *
 * Kept to three kinds on purpose. Every extra kind is another place the engine
 * has to remember to look, and a knack the engine forgets is worse than no
 * knack at all.
 */
export type KnackEffect =
  /** Always on: adds to every check of one stat. */
  | { kind: "BONUS"; stat: StatKey; amount: number }
  /**
   * A privilege the storyteller is told about and must honour. No dice, no
   * bookkeeping — the effect is that the story behaves differently.
   */
  | { kind: "NARRATIVE" }
  /** One more thing in the pack before every adventure. */
  | { kind: "SUPPLY"; extra: number }
  /** Room on the sheet for more of what she has learned. */
  | { kind: "SKILL_ROOM"; extra: number };

export type Knack = {
  key: string;
  name: string;
  /** Shown to the player, in her words. */
  blurb: string;
  /**
   * What earns it a place on her list. Matched against the stats she rolls and
   * the things she keeps trying, so the offer is about her rather than generic.
   */
  drawnFrom: { stat?: StatKey; practice?: string[] };
  effect: KnackEffect;
  /** Told to the Game Master when she has it. */
  narrationHint?: string;
};

export const KNACKS: Knack[] = [
  {
    key: "sure_footed",
    name: "Sure-footed",
    blurb: "You are harder to knock over than you look. Might comes easier to you now.",
    drawnFrom: { stat: "might", practice: ["climb", "lift", "carry", "hold", "push"] },
    effect: { kind: "BONUS", stat: "might", amount: 1 },
  },
  {
    key: "quick_eye",
    name: "Quick Eye",
    blurb: "You notice the thing everyone else walked past. Wits comes easier to you now.",
    drawnFrom: { stat: "wits", practice: ["search", "look", "notic", "read", "puzzl"] },
    effect: { kind: "BONUS", stat: "wits", amount: 1 },
  },
  {
    key: "warm_word",
    name: "A Warm Word",
    blurb: "People believe you mean it, because you do. Heart comes easier to you now.",
    drawnFrom: { stat: "heart", practice: ["comfort", "persuad", "calm", "ask", "sooth"] },
    effect: { kind: "BONUS", stat: "heart", amount: 1 },
  },
  {
    key: "cats_balance",
    name: "Cat's Balance",
    blurb: "You land on your feet, even when the roof disagrees. Grace comes easier to you now.",
    drawnFrom: { stat: "grace", practice: ["sneak", "climb", "dodge", "balanc", "catch"] },
    effect: { kind: "BONUS", stat: "grace", amount: 1 },
  },
  {
    key: "lucky_pocket",
    name: "Lucky Pocket",
    blurb: "The thing you need has a way of being the thing you find. Luck comes easier to you now.",
    drawnFrom: { stat: "luck", practice: ["search", "rummag", "guess", "find", "gambl"] },
    effect: { kind: "BONUS", stat: "luck", amount: 1 },
  },
  {
    key: "iron_grip",
    name: "Iron Grip",
    blurb: "What you hold, stays held. Grit comes easier to you now.",
    drawnFrom: { stat: "grit", practice: ["hold", "endur", "wait", "stand", "carry"] },
    effect: { kind: "BONUS", stat: "grit", amount: 1 },
  },
  {
    key: "brighter_spark",
    name: "A Brighter Spark",
    blurb: "Odd things listen when you talk to them. Spark comes easier to you now.",
    drawnFrom: { stat: "spark", practice: ["sing", "hum", "wonder", "charm", "magic"] },
    effect: { kind: "BONUS", stat: "spark", amount: 1 },
  },
  {
    key: "good_listener",
    name: "Good Listener",
    blurb:
      "Once a chapter, ask the storyteller one true thing about anybody in the scene. It has to answer.",
    drawnFrom: { stat: "heart", practice: ["listen", "talk", "ask"] },
    effect: { kind: "NARRATIVE" },
    narrationHint:
      "Once a chapter this character may ask you one true thing about any person or creature in the scene, and you must answer honestly and usefully — not evasively.",
  },
  {
    key: "never_lost",
    name: "Never Lost",
    blurb: "You always know the way back. Ask, and the storyteller must tell you.",
    drawnFrom: { stat: "wits", practice: ["walk", "explor", "track", "follow"] },
    effect: { kind: "NARRATIVE" },
    narrationHint:
      "This character always knows the way back to somewhere the party has already been, and you must say plainly what it is whenever they ask.",
  },
  {
    key: "deep_pockets",
    name: "Deep Pockets",
    blurb: "You always seem to have brought one more thing than everybody else.",
    drawnFrom: { practice: ["pack", "search", "find"] },
    effect: { kind: "SUPPLY", extra: 1 },
  },
  {
    key: "fast_learner",
    name: "Fast Learner",
    blurb: "You have room on your sheet for two more things than most people manage.",
    drawnFrom: { stat: "wits", practice: ["learn", "practis", "read"] },
    effect: { kind: "SKILL_ROOM", extra: 2 },
  },
  {
    key: "the_loud_one",
    name: "The Loud One",
    blurb:
      "Once a chapter, tell everybody what to do — and it works. Everyone else's next roll goes better. Never your own.",
    drawnFrom: { stat: "spark", practice: ["shout", "sing", "lead", "call"] },
    effect: { kind: "NARRATIVE" },
    narrationHint:
      "Once a chapter this character can rally the others; when they do, say plainly that everyone else's next attempt goes better than it should have, and narrate it that way.",
  },
  {
    key: "stubborn",
    name: "Stubborn",
    blurb: "When something goes wrong for you, it goes a little less wrong than it might have.",
    drawnFrom: { stat: "might", practice: ["hold", "stand", "wait", "endur"] },
    effect: { kind: "NARRATIVE" },
    narrationHint:
      "When this character's roll goes badly, narrate the setback as the mildest version of itself — inconvenient rather than ruinous. Never cancel it; soften it.",
  },
  {
    key: "friend_to_all",
    name: "Friend to All",
    blurb: "Nothing that meets you starts out hostile. It might still be frightened.",
    drawnFrom: { stat: "heart", practice: ["speak", "greet", "feed", "befriend"] },
    effect: { kind: "NARRATIVE" },
    narrationHint:
      "Creatures and strangers meeting this character are never hostile to begin with. Wary, frightened or rude is fine; hostile is not.",
  },
  {
    key: "light_step",
    name: "Light Step",
    blurb: "You are very hard to hear coming, and things are slower to notice you.",
    drawnFrom: { stat: "wits", practice: ["sneak", "hide", "creep", "slip"] },
    effect: { kind: "NARRATIVE" },
    narrationHint:
      "This character is unusually quiet. Anything that would notice them notices a beat later than it otherwise would, which is often the beat that matters.",
  },
];

export function knackByKey(key: string): Knack | undefined {
  return KNACKS.find((knack) => knack.key === key);
}

/**
 * How many knacks a character of this level has earned, in total.
 *
 * One per level after the first, so reaching level 2 is the first time anything
 * is offered. Level 1 is who she was built as; everything after it is who she
 * has become.
 */
export function knacksEarned(level: number): number {
  return Math.max(0, level - 1);
}

export function knacksUnspent(level: number, taken: number): number {
  return Math.max(0, knacksEarned(level) - taken);
}

// ---- What she is offered ----------------------------------------------------

export type OfferInput = {
  /** Stable, so the same character is offered the same three every page load. */
  characterId: string;
  level: number;
  stats: Record<StatKey, number>;
  /** Normalised practice keys and how often each was attempted. */
  practices: { key: string; attempts: number }[];
  /** Keys she already has. */
  taken: string[];
};

/** How many are offered. Three is a choice; five is a menu. */
export const KNACKS_OFFERED = 3;

/**
 * How well a knack matches what this character has actually been doing.
 *
 * Practice counts for more than a stat, because it is the more specific claim:
 * a high Wits says how she was built, but four attempts at sneaking says what
 * she has been *doing*, and the second is the thing worth rewarding.
 */
export function affinity(knack: Knack, input: OfferInput): number {
  let score = 0;

  if (knack.drawnFrom.stat) {
    const ranked = [...Object.entries(input.stats)].sort((a, b) => b[1] - a[1]);
    const position = ranked.findIndex(([stat]) => stat === knack.drawnFrom.stat);
    if (position === 0) score += 2;
    else if (position === 1) score += 1;
  }

  for (const stem of knack.drawnFrom.practice ?? []) {
    const practised = input.practices.find((practice) => practice.key.startsWith(stem));
    if (practised) score += 2 + Math.min(3, practised.attempts);
  }

  return score;
}

/** A small stable hash, so the wildcard is the same one every page load. */
function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

/**
 * The three she is offered.
 *
 * Two earned — the best matches for what she has been doing — and one wildcard,
 * so nobody gets funnelled into the same character every time. Every one of
 * them is worth having, so a child cannot pick badly here.
 *
 * Deterministic in the character and the level, deliberately. An offer that
 * changed on every page load would let a girl refresh until she liked it, which
 * turns a decision into a slot machine.
 */
export function offerFor(input: OfferInput): Knack[] {
  const taken = new Set(input.taken);
  const available = KNACKS.filter((knack) => !taken.has(knack.key));
  if (available.length <= KNACKS_OFFERED) return available;

  const ranked = [...available].sort((a, b) => {
    const difference = affinity(b, input) - affinity(a, input);
    // Ties break on the key so the order never wobbles between page loads.
    return difference !== 0 ? difference : a.key.localeCompare(b.key);
  });

  const earned = ranked.slice(0, KNACKS_OFFERED - 1);
  const rest = ranked.slice(KNACKS_OFFERED - 1);
  const wildcard = rest[hash(`${input.characterId}:${input.level}`) % rest.length];

  return [...earned, wildcard];
}

// ---- What they do -----------------------------------------------------------

/** The total bonus her knacks add to checks of one stat. */
export function knackBonusFor(keys: string[], stat: StatKey): number {
  return keys.reduce((total, key) => {
    const effect = knackByKey(key)?.effect;
    return effect?.kind === "BONUS" && effect.stat === stat ? total + effect.amount : total;
  }, 0);
}

/** How many extra things she may pack, above everybody's two. */
export function extraSupplies(keys: string[]): number {
  return keys.reduce((total, key) => {
    const effect = knackByKey(key)?.effect;
    return effect?.kind === "SUPPLY" ? total + effect.extra : total;
  }, 0);
}

/** How much more room she has on her sheet for skills. */
export function extraSkillRoom(keys: string[]): number {
  return keys.reduce((total, key) => {
    const effect = knackByKey(key)?.effect;
    return effect?.kind === "SKILL_ROOM" ? total + effect.extra : total;
  }, 0);
}

/** The lines the storyteller is told, for knacks the story has to honour. */
export function narrativeHints(keys: string[]): string[] {
  return keys
    .map((key) => knackByKey(key))
    .filter((knack): knack is Knack => knack !== undefined && knack.narrationHint !== undefined)
    .map((knack) => `${knack.name}: ${knack.narrationHint}`);
}
