/**
 * Matching what a chapter asked the party to find against what they actually
 * came away with.
 *
 * Necessarily forgiving. The storyline says "the brass key"; the storyteller
 * writes it into the scene as "a small brass key, green at the teeth"; the
 * extraction step records whatever it wrote. Requiring those three to be the
 * same string would mean the list on screen said "still looking" about
 * something in a child's pocket, which is worse than saying nothing at all.
 *
 * So the comparison is on the words that carry the meaning, and a match in
 * either direction counts. It errs toward saying "found": a false "found" is a
 * list that goes quiet, and a false "still looking" sends a family hunting for
 * something they already have.
 */

/** Words too common to identify anything on their own. */
const NOISE = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "with",
  "some",
  "one",
  "small",
  "little",
  "old",
  "for",
  "to",
  "from",
  "in",
  "on",
  "her",
  "his",
  "their",
  "its",
]);

/** The crude singulariser: enough to make "keys" match "key", no stemmer. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/**
 * The words of a description, as written and as compared.
 *
 * Both forms, because the two uses want different ones and conflating them
 * produced a genuinely funny bug: the stem of "brass" is "bras", which is
 * exactly right for matching "brass key" against "a brass key" and exactly
 * wrong to put on a screen in front of a nine-year-old under the words "things
 * to look for".
 */
function wordPairs(text: string): { written: string; stemmed: string }[] {
  return text
    .toLocaleLowerCase()
    // Hyphens are kept, so a lantern-fox feather is not a lantern. A compound
    // is its own word, and splitting on the hyphen would quietly report a thing
    // as found because something else was named after it.
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ written: word, stemmed: stem(word) }))
    .filter((pair) => !NOISE.has(pair.stemmed));
}

function meaningfulWords(text: string): string[] {
  return wordPairs(text).map((pair) => pair.stemmed);
}

/** Whether a carried item is plausibly the thing the chapter asked for. */
export function looksLikeTheSameThing(sought: string, carried: string): boolean {
  const wanted = meaningfulWords(sought);
  const held = new Set(meaningfulWords(carried));
  if (wanted.length === 0 || held.size === 0) return false;

  // Every meaningful word of the shorter description appearing in the longer
  // one is the test: "brass key" is inside "a small brass key, green at the
  // teeth", and "key" alone is inside both.
  const overlap = wanted.filter((word) => held.has(word)).length;
  return overlap === wanted.length || overlap >= Math.min(2, held.size);
}

/**
 * What the game would actually accept, said out loud.
 *
 * The matcher above has always been generous — *the brass key* is satisfied by
 * *a small brass key, green at the teeth* — and the screen has always shown the
 * storyline's exact words and nothing else. So a nine-year-old reads *"the
 * collector's sky-map, creased and still warm"* as a riddle with one answer,
 * hunts for that exact phrase, and never learns that any map of the sky would
 * have done.
 *
 * That gap is worth closing with the truth rather than with a hint, and the
 * truth is already here: these are the words `looksLikeTheSameThing` is looking
 * for. Showing them is not making the quest easier — it is telling a child what
 * the rules of the game she is playing actually are.
 *
 * Returns the words in the order they were written, so the phrase reads the way
 * she wrote it: "sky-map" before "creased".
 */
export function whatWouldCount(sought: string): string[] {
  // The written form, not the stemmed one — see `wordPairs`. De-duplicated on
  // the stem, because "a key, the brass keys" should not ask her to find
  // something with "key" in it twice.
  const seen = new Set<string>();
  const out: string[] = [];

  for (const pair of wordPairs(sought)) {
    if (seen.has(pair.stemmed)) continue;
    seen.add(pair.stemmed);
    out.push(pair.written);
  }

  return out;
}

export type SoughtItem = {
  name: string;
  actIndex: number;
  actTitle: string;
  /** Who is carrying it, when somebody is. */
  foundBy: string | null;
};

/** Works out which of the storyline's named finds the party now holds. */
export function reconcileFinds(
  seeks: { name: string; actIndex: number; actTitle: string }[],
  carried: { name: string; holder: string }[],
): SoughtItem[] {
  return seeks.map((sought) => {
    const match = carried.find((item) => looksLikeTheSameThing(sought.name, item.name));
    return { ...sought, foundBy: match?.holder ?? null };
  });
}
