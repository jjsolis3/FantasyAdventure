/**
 * Labels for the campaign settings, kept in one place so the setup flow and
 * the campaign page cannot drift apart.
 */

export const TONE_OPTIONS = [
  {
    value: "COZY",
    label: "Cozy",
    blurb: "Warm and low-stakes. Setbacks are inconveniences, never threats.",
  },
  {
    value: "ADVENTUROUS",
    label: "Adventurous",
    blurb: "Real tension and real stakes — eerie is allowed. Still no gore and nobody dies.",
  },
  {
    value: "SPOOKY",
    label: "Spooky",
    blurb:
      "Meant to be frightening: dread, being watched, something wrong with the ordinary. " +
      "For a table that likes Goosebumps. Nobody is ever caught or hurt, and every scene " +
      "still leaves a way through.",
  },
] as const;

export const READING_LEVEL_OPTIONS = [
  {
    value: "EARLY_READER",
    label: "Early reader",
    blurb: "Short sentences, simple words. Around ages 5–7.",
  },
  {
    value: "MIDDLE_GRADE",
    label: "Middle grade",
    blurb: "Roughly Harry Potter or Wings of Fire. Around ages 8–12.",
  },
  {
    value: "TEEN",
    label: "Teen",
    blurb: "Richer vocabulary and more nuance. Ages 13 and up.",
  },
  {
    value: "FAMILY_MIXED",
    label: "Mixed ages",
    blurb: "Clear enough for the youngest at the table, with asides for the oldest.",
  },
] as const;

/**
 * How the storyteller plays — a different question from tone.
 *
 * Tone is what the world is like; this is the manner of the person telling it.
 * Both are offered because they genuinely combine: spooky played straight is
 * horror, spooky played madcap is Goosebumps.
 *
 * The blurbs say what changes rather than naming a mood, because "playful" on
 * its own is a word two people will read two ways.
 */
export const MANNER_OPTIONS = [
  {
    value: "STRAIGHT",
    label: "Plays it straight",
    blurb:
      "Describes what happens and stops. No winking, no jokes on top. The world takes itself " +
      "seriously — which is its own kind of fun.",
  },
  {
    value: "BALANCED",
    label: "Just right",
    blurb: "The usual storyteller. Warm, a bit wry, gets on with the story.",
  },
  {
    value: "PLAYFUL",
    label: "A bit of mischief",
    blurb:
      "Small things are funny — a goat with opinions, a door that sighs. The stakes stay real; " +
      "the telling is light.",
  },
  {
    value: "MADCAP",
    label: "Utterly bananas",
    blurb:
      "The world says yes. Try something ridiculous and the ridiculous thing happens, then has " +
      "consequences nobody planned. Never at an adventurer's expense.",
  },
] as const;

export const MANNER_LABELS: Record<string, string> = Object.fromEntries(
  MANNER_OPTIONS.map((option) => [option.value, option.label]),
);

export const INPUT_MODE_OPTIONS = [
  {
    value: "SHARED_SCREEN",
    label: "One shared screen",
    blurb:
      "Everyone round one device. The storyteller asks each adventurer in turn, and one person types.",
  },
  {
    value: "OWN_DEVICE",
    label: "Everyone on their own device",
    blurb:
      "Each player answers on their own phone or laptop, all at the same time. The turn is taken once everybody has answered.",
  },
] as const;

export const INPUT_MODE_LABELS: Record<string, string> = Object.fromEntries(
  INPUT_MODE_OPTIONS.map((option) => [option.value, option.label]),
);

export const TONE_LABELS: Record<string, string> = Object.fromEntries(
  TONE_OPTIONS.map((option) => [option.value, option.label]),
);

export const READING_LEVEL_LABELS: Record<string, string> = Object.fromEntries(
  READING_LEVEL_OPTIONS.map((option) => [option.value, option.label]),
);

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  SETUP: "Ready to begin",
  ACTIVE: "In progress",
  PAUSED: "Paused",
  COMPLETE: "Finished",
};
