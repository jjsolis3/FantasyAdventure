/**
 * A last line of defence on what reaches the table.
 *
 * The system prompt does most of the work; this catches the cases where a
 * small model drifts anyway. It is deliberately a blunt instrument — cheap,
 * synchronous, and biased toward regenerating rather than blocking, because a
 * false positive costs one extra call and a false negative costs a child
 * reading something horrible.
 */

/** Word-boundary matched, so "scarlet" does not trip "scar". */
const FORBIDDEN = [
  // Death and serious harm.
  "\\bdies?\\b",
  "\\bdied\\b",
  "\\bdeath\\b",
  "\\bdead\\b",
  "\\bkill(?:s|ed|ing)?\\b",
  "\\bmurder(?:s|ed|ing)?\\b",
  "\\bcorpse(?:s)?\\b",
  "\\bblood(?:y|ied)?\\b",
  "\\bgore\\b",
  "\\bsever(?:s|ed|ing)?\\b",
  "\\bstab(?:s|bed|bing)?\\b",
  "\\btortur(?:e|es|ed|ing)\\b",
  "\\bsuicide\\b",
  // Slurs and profanity are handled by the model's own alignment; what is
  // listed here is what a wholesome-family prompt still lets through.
  "\\bdamn\\b",
  "\\bhell\\b",
];

const FORBIDDEN_PATTERN = new RegExp(FORBIDDEN.join("|"), "i");

/**
 * Phrases that contain a forbidden word innocently. Checked first, and their
 * matches removed before scanning, so "dead end" and "dead leaves" do not
 * trigger a pointless regeneration.
 */
const INNOCENT = [
  /\bdead end\b/gi,
  /\bdead leaves\b/gi,
  /\bdead of night\b/gi,
  /\bdead weight\b/gi,
  /\bdead quiet\b/gi,
  /\bdead still\b/gi,
  /\bkill time\b/gi,
  /\bblood orange\b/gi,
  /\bbloodhound\b/gi,
  /\bhellebore\b/gi,
  // A frightening story reaches for these constantly and means nothing by any
  // of them. Without them the spooky tone would spend half its turns being
  // regenerated over the word "deadbolt".
  /\bdeadbolt(?:s|ed)?\b/gi,
  /\bdead of winter\b/gi,
  /\bdead silence\b/gi,
  /\bdead[- ]?bolt(?:s|ed)?\b/gi,
  /\bstopped dead\b/gi,
  /\bdeadpan\b/gi,
  /\bdeadline(?:s)?\b/gi,
];

export type SafetyVerdict = { ok: true } | { ok: false; matched: string };

export function checkNarration(text: string): SafetyVerdict {
  let scrubbed = text;
  for (const pattern of INNOCENT) scrubbed = scrubbed.replace(pattern, " ");

  const match = scrubbed.match(FORBIDDEN_PATTERN);
  if (match) return { ok: false, matched: match[0] };
  return { ok: true };
}

/** Appended to a regeneration request when the first attempt tripped the guard. */
export function safetyReminder(matched: string): string {
  return (
    `Your previous version used the word "${matched}", which is not allowed in this game. ` +
    `Rewrite the same scene with nothing frightening or harmful: nobody is hurt, nobody dies, ` +
    `and any danger turns out to be something that can be solved with kindness or cleverness.`
  );
}

/**
 * Player input gets a lighter touch than narration.
 *
 * Children type nonsense and test boundaries, and refusing them with an error
 * breaks the fiction. Instead, flagged input is passed to the Game Master with
 * a note to deflect it in-story — the game bends the moment rather than
 * stopping it.
 */
export function checkPlayerInput(text: string): SafetyVerdict {
  return checkNarration(text);
}

export const IN_FICTION_DEFLECTION =
  "One of the players suggested something that does not belong in this story. " +
  "Do not repeat or describe it. Have their character think better of it, or have " +
  "something small and harmless interrupt, and carry on.";
