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

function meaningfulWords(text: string): string[] {
  return text
    .toLocaleLowerCase()
    // Hyphens are kept, so a lantern-fox feather is not a lantern. A compound
    // is its own word, and splitting on the hyphen would quietly report a thing
    // as found because something else was named after it.
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Crude singularisation, which is all that is needed to make "keys" match
    // "key" without dragging in a stemmer.
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .filter((word) => !NOISE.has(word));
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
