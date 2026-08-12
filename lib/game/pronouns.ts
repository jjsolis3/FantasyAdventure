/**
 * Talking about a character the way their player asked us to.
 *
 * Pronouns have always been stored, and have always been handed to the
 * storyteller, which is why the *story* got them right. The screens did not:
 * headings and labels were written with "she" and "her" baked into them, so a
 * page about a character whose player had chosen he/him still said "What she is
 * like" and "Change her details". Getting this wrong on somebody's own
 * character sheet is a small thing that reads as not having been listened to.
 *
 * Parsed from the free-text field rather than an enum, because the field is
 * free text: a player can type anything, and "xe/xem" should work as well as
 * the three the builder offers.
 */

export type Pronouns = {
  /** "she" — as in *she found it*. */
  subject: string;
  /** "her" — as in *give it to her*. */
  object: string;
  /** "her" — as in *her lantern*. */
  possessive: string;
};

const THEY: Pronouns = { subject: "they", object: "them", possessive: "their" };

/**
 * The possessive for the sets we know, which the "she/her" field cannot supply.
 *
 * "she/her" carries subject and object and stops; the possessive is a third
 * word nobody types. Known sets get theirs from here, and anything unfamiliar
 * borrows the object form, which is right far more often than it is wrong
 * ("xe/xem" → "xem's" is at least understandable, where guessing would not be).
 */
const POSSESSIVES: Record<string, string> = {
  she: "her",
  he: "his",
  they: "their",
  it: "its",
};

/**
 * Reads "he/him" into the words a sentence needs.
 *
 * Falls back to they/them for anything unparseable, which is the right default
 * for a game where a character might be a dragon, a lantern or a goat — and the
 * one choice that is never a misgendering.
 */
export function pronounsOf(field: string | null | undefined): Pronouns {
  const parts = (field ?? "")
    .toLocaleLowerCase()
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return THEY;

  const subject = parts[0];
  const object = parts[1] ?? subject;

  return {
    subject,
    object,
    possessive: POSSESSIVES[subject] ?? parts[2] ?? object,
  };
}

/** "She", "He", "They" — for the start of a sentence. */
export function capitalise(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}

/**
 * Whether a subject pronoun takes a plural verb.
 *
 * "they is like" is the sort of thing that makes a sentence look machine-made,
 * and it is the one grammatical difference these three sets actually have.
 */
export function isPlural(subject: string): boolean {
  return subject === "they";
}

/** "she is" / "they are", so a heading reads properly either way. */
export function toBe(subject: string): string {
  return isPlural(subject) ? "are" : "is";
}

/** "she has" / "they have". */
export function toHave(subject: string): string {
  return isPlural(subject) ? "have" : "has";
}
