/**
 * What she looks like — chosen, not typed.
 *
 * ## Two problems, one shape
 *
 * **The one the family reported.** A parent wrote a paragraph in the
 * description box and the storyteller worked it into every passage. That is not
 * the model being greedy; it is the only reading available to it. `renderParty`
 * in `lib/ai/context.ts` appended `description` to the party line unlabelled,
 * right beside the stats, so the most distinctive sentence the prompt contained
 * was also the only one with no stated purpose. Handed that, a storyteller
 * treats it as *what this character is about*.
 *
 * **The one the girls would have reported if asked.** They are nine and ten and
 * they play Dress to Impress. Their adventurer had four stats, two skills, and a
 * text box. Everything the game had added since made those numbers *deeper*; it
 * never made her look like anybody.
 *
 * Both are answered by splitting the sheet in two. What she looks like becomes
 * structured and browsable; who she is stays one sentence of personality. The
 * look then goes to the drawing prompt at full strength and to the storyteller
 * as a labelled, explicitly minor line.
 *
 * ## Why pickers rather than a better text box
 *
 * A ten-year-old deciding what her adventurer wears does not want to describe;
 * she wants to *browse*. That is the whole appeal of the games she already
 * plays. A list she can scroll is also the only version that produces
 * vocabulary the drawing model can use — "a hooded travelling cloak, moss
 * green" draws; "she looks cool" does not.
 *
 * Nothing here is enforced. Every slot takes free text too, exactly like race
 * and archetype, because a child who wants a coat made of bees should get one.
 */

/** The parts of a look, in the order they are chosen and shown. */
export const SLOTS = ["hair", "outfit", "layer", "armour", "colour", "signature"] as const;

export type SlotKey = (typeof SLOTS)[number];

export type SlotInfo = {
  /** The heading on the picker. */
  label: string;
  /** The question a child is actually answering. */
  question: string;
  /**
   * How this slot reads inside a sentence.
   *
   * The look is rendered as prose for the drawing model and for the party line,
   * and "wearing" versus "carrying" versus "with" is the difference between a
   * sentence and a list of nouns.
   */
  lead: string;
  options: string[];
};

/**
 * What each slot offers.
 *
 * Written to be read aloud. A nine-year-old picking from this list is choosing
 * between things she can picture, so every entry is concrete — "a patched
 * travelling coat", never "casual outerwear" — and none of them is better than
 * any other. There is no best cloak.
 */
export const WARDROBE: Record<SlotKey, SlotInfo> = {
  hair: {
    label: "Hair",
    question: "What does their hair do?",
    lead: "with",
    options: [
      "a long braid down one shoulder",
      "two braids, tied with ribbon",
      "short and forever sticking up",
      "a cloud of curls",
      "shaved at the sides, long on top",
      "a high ponytail that swings",
      "straight and dark, cut at the chin",
      "silver-white, past the waist",
      "a bun with a pencil through it",
      "wild, and full of leaves",
      "copper red, always in their eyes",
      "hidden under a hood, mostly",
    ],
  },
  outfit: {
    label: "What they wear",
    question: "What are they wearing underneath everything?",
    lead: "wearing",
    options: [
      "a patched tunic and good boots",
      "a plain dress with deep pockets",
      "trousers, braces, and rolled sleeves",
      "a long coat that used to be somebody else's",
      "workshop overalls, permanently stained",
      "a starched shirt they refuse to untuck",
      "layers, all of them slightly too big",
      "soft clothes made for climbing",
      "a striped jumper and mismatched socks",
      "travelling leathers, well worn in",
      "a waistcoat with far too many pockets",
      "an apron they never take off",
    ],
  },
  layer: {
    label: "Over the top",
    question: "What do they throw on to go outside?",
    lead: "under",
    options: [
      "a hooded travelling cloak",
      "a fur-lined mantle, far too warm",
      "a patchwork quilt worn as a cape",
      "a beekeeper's veil, pushed back",
      "a scarf wound three times round",
      "an oilskin that smells of rain",
      "a shawl their grandmother made",
      "a moth-eaten opera cape",
      "nothing — they run warm",
      "a satchel strap and nothing else",
      "a poncho woven with stars",
      "somebody else's enormous jacket",
    ],
  },
  armour: {
    label: "Armour",
    question: "What do they put on when it might get dangerous?",
    lead: "and",
    options: [
      "nothing at all — speed is the plan",
      "a battered helm two sizes too big",
      "leather bracers, scuffed pale",
      "a single shoulder plate",
      "a shield painted with their own mark",
      "chain under the shirt, hidden",
      "a breastplate polished to a mirror",
      "quilted padding, stitched by hand",
      "greaves that clank, unfortunately",
      "a gauntlet on the throwing hand",
      "a helmet with a very silly plume",
      "bark and bound moss, grown on",
    ],
  },
  colour: {
    label: "Their colour",
    question: "What colour is theirs?",
    lead: "in",
    options: [
      "moss green",
      "deep red",
      "midnight blue",
      "butter yellow",
      "charcoal grey",
      "rust orange",
      "lilac",
      "sea foam",
      "cream and gold",
      "blackberry purple",
      "sky blue",
      "copper brown",
    ],
  },
  signature: {
    label: "One more thing",
    question: "What would somebody remember them by?",
    lead: "and always",
    options: [
      "a wooden bird carved by a friend",
      "ink stains on every finger",
      "a whistle on a cord",
      "a scar through one eyebrow",
      "spectacles mended with wire",
      "a pocket full of interesting stones",
      "one very loud laugh",
      "a ribbon tied round the wrist",
      "boots that have been resoled twice",
      "a small animal, usually asleep",
      "a compass that points the wrong way",
      "freckles, everywhere",
    ],
  },
};

/**
 * A look as it is stored and passed around.
 *
 * Every slot optional, and that is deliberate: a girl who wants to pick only a
 * colour and a hairstyle should be finished. Half a look is a look.
 */
export type Look = Partial<Record<SlotKey, string>>;

/** Whether anything has been chosen at all. */
export function hasLook(look: Look): boolean {
  return SLOTS.some((slot) => (look[slot] ?? "").trim().length > 0);
}

/** The database column one slot lives in. `hair` → `lookHair`. */
export function columnFor(slot: SlotKey): string {
  return `look${slot[0].toLocaleUpperCase()}${slot.slice(1)}`;
}

/** A character row read as a look. */
export function lookOf(row: Record<string, unknown>): Look {
  const look: Look = {};
  for (const slot of SLOTS) {
    const value = row[columnFor(slot)];
    if (typeof value === "string" && value.trim()) look[slot] = value.trim();
  }
  return look;
}

/**
 * A look written back as columns, empty slots nulled.
 *
 * Every slot always present, so clearing one is a real update rather than a
 * field quietly left behind — a girl who takes the helmet off should have it
 * off, and a partial write would leave it on forever.
 */
export function lookColumns(look: Look): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  for (const slot of SLOTS) {
    const value = (look[slot] ?? "").trim();
    columns[columnFor(slot)] = value || null;
  }
  return columns;
}

/**
 * The look as one sentence.
 *
 * Used three times over — the drawing prompt, the party line the storyteller
 * reads, and the sheet — and the same sentence every time, on purpose. A
 * portrait that does not match the sheet is worse than no portrait.
 *
 * The colour slot is folded into whatever it can sensibly colour rather than
 * left dangling: "in moss green" on its own is a sentence about nothing.
 */
export function lookSentence(look: Look, name?: string): string {
  const parts: string[] = [];

  const colour = look.colour?.trim();
  const outfit = look.outfit?.trim();
  const layer = look.layer?.trim();
  const armour = look.armour?.trim();
  const hair = look.hair?.trim();
  const signature = look.signature?.trim();

  if (hair) parts.push(`with ${hair}`);
  if (outfit) parts.push(`wearing ${outfit}${colour && !layer ? `, in ${colour}` : ""}`);
  if (layer) parts.push(`under ${layer}${colour ? `, in ${colour}` : ""}`);
  // Only when there is something to colour. A look that is a colour and nothing
  // else still deserves to say so.
  if (colour && !outfit && !layer) parts.push(`all in ${colour}`);
  if (armour && !/^nothing/i.test(armour)) parts.push(`and ${armour}`);
  if (signature) parts.push(`and always ${signature}`);

  if (parts.length === 0) return "";
  return `${name ? `${name}, ` : ""}${parts.join(", ")}.`;
}

// ---- The wardrobe that grows -----------------------------------------------

/**
 * Words that mean a thing can be worn, by slot.
 *
 * Matched against the names the storyteller gave things it handed out, which is
 * the only handle available: `InventoryItem` records a name and a description
 * and nothing about whether it goes on a body. Adding a "wearable" flag would
 * mean the storyteller deciding, and a 7B model asked one more boolean per item
 * is a 7B model that gets it wrong sometimes and holds up a turn.
 *
 * Reading the names instead costs nothing, runs on things found months ago, and
 * fails in the harmless direction: a missed cloak is a cloak she can still type
 * in, and there is no false positive that matters — the worst case is that
 * "helm of the barley field" is offered as armour, which it is.
 */
const WEARABLE: Record<string, string[]> = {
  layer: ["cloak", "cape", "mantle", "shawl", "coat", "jacket", "scarf", "hood", "poncho", "veil"],
  armour: [
    "armour",
    "armor",
    "helm",
    "helmet",
    "shield",
    "bracer",
    "gauntlet",
    "breastplate",
    "chainmail",
    "mail",
    "greave",
    "pauldron",
    "vambrace",
  ],
  signature: [
    "amulet",
    "pendant",
    "necklace",
    "ring",
    "charm",
    "brooch",
    "badge",
    "talisman",
    "locket",
    "feather",
    "medal",
    "token",
  ],
};

export type EarnedWearable = { slot: SlotKey; text: string; from: string };

/**
 * Things she found that she could reasonably put on.
 *
 * The hook that turns a dressing-up screen into part of the game. A cloak
 * chosen from a list is a preference; a cloak taken off a scarecrow in chapter
 * three and worn ever since is a story, and the game already knows which
 * adventure every item came from.
 *
 * Nothing is consumed and nothing is locked — wearing it is not using it, and
 * an item that a rank requirement says she cannot *use* she can still put on.
 * That distinction is deliberate: a helmet too big for her is a good look.
 */
export function earnedWearables(
  items: { name: string; foundInCampaignId?: string | null }[],
  campaignTitles: Map<string, string>,
): EarnedWearable[] {
  const out: EarnedWearable[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const lower = item.name.toLocaleLowerCase();
    for (const [slot, words] of Object.entries(WEARABLE)) {
      if (!words.some((word) => lower.includes(word))) continue;
      if (seen.has(item.name)) break;
      seen.add(item.name);

      const from = item.foundInCampaignId ? campaignTitles.get(item.foundInCampaignId) : null;
      out.push({
        slot: slot as SlotKey,
        text: item.name,
        // "found on the way" for anything whose adventure has been tidied up.
        // Losing the title should not lose the fact that she earned it.
        from: from ? `from ${from}` : "found on the way",
      });
      break;
    }
  }

  return out;
}

/**
 * The palette a crest is drawn in, when there is no picture of any kind.
 *
 * Every household will not have a drawing model, and most never will. The
 * bottom rung of the portrait ladder has to work with no provider, no upload
 * and no network — so it is two colours and a letter, and the colours come from
 * the look she chose rather than from her id, because a crest that ignores the
 * afternoon she spent choosing moss green is a crest that says the choosing did
 * not matter.
 */
export const COLOUR_INK: Record<string, { ink: string; wash: string }> = {
  "moss green": { ink: "#a3c9a8", wash: "#1d3125" },
  "deep red": { ink: "#e8a0a0", wash: "#3a1618" },
  "midnight blue": { ink: "#9fb6e8", wash: "#161d38" },
  "butter yellow": { ink: "#efd9a0", wash: "#3a2f14" },
  "charcoal grey": { ink: "#c4c4c4", wash: "#222222" },
  "rust orange": { ink: "#f0b48a", wash: "#3b2013" },
  lilac: { ink: "#d3b8e8", wash: "#2a1c38" },
  "sea foam": { ink: "#a5dcd4", wash: "#123230" },
  "cream and gold": { ink: "#ecdcb8", wash: "#33280f" },
  "blackberry purple": { ink: "#c9a3d8", wash: "#251435" },
  "sky blue": { ink: "#a8cfe8", wash: "#152b3a" },
  "copper brown": { ink: "#dcb08c", wash: "#332015" },
};

/** The default, for a look with no colour in it yet. */
export const DEFAULT_INK = { ink: "#e8c89a", wash: "#2b1d12" };

export function inkFor(look: Look): { ink: string; wash: string } {
  const colour = look.colour?.trim().toLocaleLowerCase();
  return (colour ? COLOUR_INK[colour] : null) ?? DEFAULT_INK;
}
