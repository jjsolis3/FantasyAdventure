/**
 * Name suggestions, shaped by race and calling.
 *
 * Deliberately not an AI call. This gets clicked ten times in a row by a
 * ten-year-old deciding whether they are a Pip or a Poppy, so it has to be
 * instant, and it has to keep working when the model server is asleep.
 *
 * Import-free and randomness-injectable, so it can be used from a client
 * component and tested deterministically.
 */

/** Given names are mixed rather than split by gender: any name suits anyone. */
const GIVEN_NAMES: Record<string, string[]> = {
  Human: [
    "Alia", "Bram", "Cass", "Della", "Edric", "Fen", "Greta", "Hollis",
    "Ida", "Jory", "Kit", "Mabel", "Nils", "Ora", "Pell", "Rue", "Tam", "Wren",
  ],
  Elf: [
    "Aeliana", "Caladwen", "Elowen", "Faelar", "Ilyra", "Lathiel", "Mirevel",
    "Nuala", "Orivel", "Selyn", "Thalor", "Ysolde", "Aerin", "Neriel",
  ],
  Dwarf: [
    "Bardin", "Dagna", "Erdi", "Gerta", "Hilda", "Korrin", "Morra",
    "Nurin", "Orla", "Rukka", "Thrain", "Vidda", "Bruni", "Hesta",
  ],
  Halfling: [
    "Bitty", "Cobb", "Dilly", "Fenna", "Gilly", "Hob", "Marigold",
    "Nettie", "Pip", "Poppy", "Rosco", "Tansy", "Willa", "Bodkin",
  ],
  "Fox-folk": [
    "Ashi", "Brindle", "Cinder", "Dusk", "Ember", "Kip", "Nim",
    "Quill", "Russet", "Sable", "Vix", "Yara", "Foxglove", "Tabby",
  ],
  Stonekin: [
    "Cairn", "Delph", "Flint", "Grit", "Hearth", "Lode", "Mica",
    "Ondra", "Quarry", "Slate", "Tor", "Vein", "Bedra", "Pumice",
  ],
  Sprite: [
    "Bix", "Fizz", "Glim", "Hush", "Jinx", "Lark", "Mote",
    "Nix", "Pib", "Squeak", "Thistle", "Whim", "Zib", "Flit",
  ],
  Tidefolk: [
    "Coral", "Delta", "Erris", "Fathom", "Ilma", "Maren", "Nerin",
    "Oona", "Rill", "Shoal", "Tessa", "Wade", "Brine", "Selka",
  ],
};

/** Used for a race the builder has never heard of, which is allowed. */
const GENERIC_GIVEN = [
  "Ash", "Bry", "Corin", "Dove", "Esk", "Fable", "Juno", "Lior",
  "Mox", "Nell", "Orin", "Perri", "Quen", "Sorrel", "Vesper", "Wisp",
];

/** First half of a two-part surname, flavoured by race. */
const RACE_SURNAME_PARTS: Record<string, string[]> = {
  Human: ["Thistle", "Bramble", "Hollow", "Marsh", "Ash", "Barrow", "Copper", "Fallow"],
  Elf: ["Silver", "Moon", "Star", "Willow", "Dawn", "Whisper", "Rain", "Evening"],
  Dwarf: ["Iron", "Stone", "Deep", "Anvil", "Ember", "Granite", "Copper", "Forge"],
  Halfling: ["Thistle", "Honey", "Butter", "Apple", "Clover", "Meadow", "Barrow", "Pudding"],
  "Fox-folk": ["Bright", "Amber", "Rust", "Quick", "Night", "Fern", "Bracken", "Hollow"],
  Stonekin: ["Moss", "Slate", "Hearth", "Deep", "Granite", "Cinder", "River", "Boulder"],
  Sprite: ["Dew", "Spark", "Flicker", "Puddle", "Giggle", "Wisp", "Breeze", "Sneeze"],
  Tidefolk: ["Salt", "Tide", "Wave", "Pearl", "Reef", "Storm", "Harbour", "Drift"],
};

const GENERIC_SURNAME_PARTS = ["Green", "Amber", "Hollow", "Bramble", "Wander", "Kindly", "Merry"];

/** Callings tint the surname too, so a Maker often ends up a Tinkerwell. */
const ARCHETYPE_SURNAME_PARTS: Record<string, string[]> = {
  Guardian: ["Shield", "Oak", "Iron", "Steady"],
  Trickster: ["Quick", "Slip", "Wink", "Nimble"],
  Healer: ["Balm", "Kind", "Willow", "Mend"],
  Scholar: ["Ink", "Page", "Quill", "Lore"],
  Beastfriend: ["Fern", "Bird", "Nest", "Wild"],
  Maker: ["Cog", "Tinker", "Nail", "Craft"],
  Songkeeper: ["Lark", "Chime", "Verse", "Hum"],
  Wondersmith: ["Star", "Glimmer", "Rune", "Candle"],
};

/** Second half of a surname. Shared, and chosen to stay gentle. */
const SURNAME_ENDINGS = [
  "down", "foot", "hollow", "brook", "wood", "field", "thorn", "gate",
  "well", "song", "light", "fall", "stride", "bell", "whistle", "patch",
  "mantle", "spark",
];

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

export type NameOptions = {
  race?: string;
  archetype?: string;
  /** Injectable for tests. */
  random?: () => number;
};

/**
 * Builds a given name plus a two-part surname, e.g. "Pip Thistledown".
 *
 * Race and calling both contribute to the surname pool, so a Halfling
 * Beastfriend can come out a Fernbrook or a Honeypatch — recognisably shaped by
 * both choices without being predictable.
 */
export function generateName(options: NameOptions = {}): string {
  const random = options.random ?? Math.random;

  const given = pick(GIVEN_NAMES[options.race ?? ""] ?? GENERIC_GIVEN, random);

  const surnameParts = [
    ...(RACE_SURNAME_PARTS[options.race ?? ""] ?? GENERIC_SURNAME_PARTS),
    ...(ARCHETYPE_SURNAME_PARTS[options.archetype ?? ""] ?? []),
  ];

  let part = pick(surnameParts, random);

  // "Ember Emberfall" reads like a mistake, so try once for something else.
  if (part.toLowerCase() === given.toLowerCase()) {
    const alternatives = surnameParts.filter(
      (entry) => entry.toLowerCase() !== given.toLowerCase(),
    );
    if (alternatives.length > 0) part = pick(alternatives, random);
  }

  const ending = pick(SURNAME_ENDINGS, random);

  return `${given} ${part}${ending}`;
}

/** Every race the generator has bespoke names for. */
export function racesWithNames(): string[] {
  return Object.keys(GIVEN_NAMES);
}
