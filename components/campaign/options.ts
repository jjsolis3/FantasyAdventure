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
    blurb: "Real tension and real stakes — spooky is allowed. Still no gore and nobody dies.",
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
