/**
 * What you are bringing.
 *
 * The ritual before setting out. Every child who has played anything on a
 * screen already knows this moment — you pick your kit, and then the game
 * starts — and until now an adventure simply began with everybody's pockets
 * empty.
 *
 * The design rule, and the reason this is a list rather than a shop: **there is
 * no wrong answer**. Every supply here is useful somewhere, none is better than
 * the others, and nothing is scarce. A shop would need an economy, a balance
 * pass and a currency, and would quietly turn a cooperative game into a
 * comparison — one girl with the good sword and one without. What packing is
 * actually for is a decision that takes thirty seconds and pays off two hours
 * later when it turns out somebody brought the rope.
 *
 * The list is composed rather than fixed: a few things her calling suggests, a
 * few the story's mood suggests, and the staples anybody would take. Free-text
 * callings still work — an unrecognised one just gets the staples, so the Cloud
 * Baker packs a rope and a lantern like everybody else.
 */

export type Supply = {
  name: string;
  /** Stored on the item, and shown under it. Suggests a use without prescribing one. */
  description: string;
};

/** Things anybody would think to take, and nobody ever regrets. */
const STAPLES: Supply[] = [
  {
    name: "a coil of rope",
    description: "Long enough for most things, and it has never once been the wrong answer.",
  },
  { name: "a lantern", description: "Small, and stubborn about staying lit." },
  {
    name: "something to eat",
    description: "Shared out, it goes a good deal further than it looks.",
  },
];

/** What a calling suggests. Keys match the archetype values in the builder. */
const BY_CALLING: Record<string, Supply[]> = {
  Guardian: [
    { name: "a dented shield", description: "It has been in front of somebody before." },
    { name: "a stout walking stick", description: "For steadying, reaching, and prodding." },
  ],
  Trickster: [
    { name: "a ring of small keys", description: "None of them fits anything yet." },
    { name: "a pocketful of marbles", description: "Loud on a stone floor. Remember that." },
  ],
  Healer: [
    { name: "a tin of salve", description: "Smells of mint and something older." },
    { name: "clean cloth, folded small", description: "For scrapes, and for wrapping things." },
  ],
  Scholar: [
    { name: "a notebook and a stub of pencil", description: "Half of it is already full." },
    { name: "a folding glass", description: "Makes small things large and large things clear." },
  ],
  Beastfriend: [
    { name: "a bag of seeds", description: "Most creatures will at least come and look." },
    { name: "a whistle nobody can hear", description: "Nobody with your sort of ears, anyway." },
  ],
  Maker: [
    { name: "a roll of wire and a bent nail", description: "Between them, most things can be fixed." },
    { name: "a small hammer", description: "Heavier than it looks, and fond of being useful." },
  ],
  Songkeeper: [
    { name: "a tin whistle", description: "Three songs on it, and one of them is a good one." },
    { name: "a book of half-remembered songs", description: "The endings are missing. That is fine." },
  ],
  Wondersmith: [
    { name: "a jar of fireflies", description: "They are lent, not kept. Let them go by morning." },
    { name: "a pinch of something that glitters", description: "You are not entirely sure what it does." },
  ],
};

/** What the story's mood suggests. */
const BY_TONE: Record<string, Supply[]> = {
  COZY: [
    { name: "a flask of something warm", description: "Enough for two, if you are careful." },
    { name: "a letter from home", description: "Unopened. You are saving it." },
  ],
  ADVENTUROUS: [
    { name: "a stick of chalk", description: "For marking which way you came." },
    { name: "a spyglass with one crack", description: "The crack is only in the corner." },
  ],
  SPOOKY: [
    { name: "a candle that will not blow out", description: "It has been tested. Twice." },
    { name: "a mirror the size of your palm", description: "For looking round corners. Only that." },
    { name: "a small bell on a string", description: "So the others know where you are." },
  ],
};

/**
 * What this adventurer is offered.
 *
 * Her calling first, then the mood, then the staples — so the two most personal
 * choices are the ones she reads first, and the rope is still there at the
 * bottom for anybody who wants the rope. Deduplicated by name in case a mood
 * and a calling ever suggest the same thing.
 */
export function suppliesFor(archetype: string, tone: string): Supply[] {
  const offered = [...(BY_CALLING[archetype.trim()] ?? []), ...(BY_TONE[tone] ?? []), ...STAPLES];

  const seen = new Set<string>();
  return offered.filter((supply) => {
    const key = supply.name.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * How much anybody may take.
 *
 * Two, so that it is a choice. Three is a shopping list and one is not a
 * decision — at two, taking the mirror means not taking the bell, and that is
 * the whole game of it.
 */
export const SUPPLIES_PER_CHARACTER = 2;

/** Whether a supply name is one this adventurer was actually offered. */
export function wasOffered(archetype: string, tone: string, name: string): Supply | undefined {
  return suppliesFor(archetype, tone).find(
    (supply) => supply.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  );
}
