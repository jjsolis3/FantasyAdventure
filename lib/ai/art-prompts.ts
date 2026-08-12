/**
 * Prompts for the pictures a family makes themselves.
 *
 * Scene art is asked for automatically, one picture per scene, from whatever
 * drawing model the table has configured — and most tables have configured
 * none, because it needs an image endpoint and a bill. That leaves the game
 * looking the same whether you are on your third adventure or your thirtieth.
 *
 * The other way to get pictures is to make them once, deliberately, and upload
 * them: the chapters of an adventure, the face of a neighbour the party keeps
 * coming back to, a place they return to. Those are worth more than
 * automatically generated ones anyway — they are the same every time, so they
 * become what the thing *looks like* rather than one interpretation of it.
 *
 * This builds the prompts for that. It shares `STYLE`, `SUBJECT_RULES` and
 * `moodFor` with the automatic path on purpose: art made by hand and art asked
 * for by the app have to end up looking like one game.
 */

import { STYLE, SUBJECT_RULES, moodFor } from "./images";

/** Everything a prompt needs about the chapter it is illustrating. */
export type ChapterArt = {
  storyline: string;
  tone: string;
  actIndex: number;
  actTitle: string;
  /** The chapter's beats. Read for scenery, not for plot. */
  beats: string[];
};

/**
 * A chapter's establishing picture.
 *
 * Deliberately built from the **beats** rather than the goal. A goal is written
 * for the storyteller — "let the family meet the star and earn its trust" — and
 * describes an intention, which cannot be drawn. The beats describe things that
 * are physically in the world: runner beans, a bridge, a lighthouse lens.
 *
 * One picture per chapter rather than per scene, because a chapter is the unit
 * a family remembers. "The one with the lighthouse" is a chapter.
 */
export function chapterArtPrompt(input: ChapterArt): string {
  return [
    STYLE,
    SUBJECT_RULES,
    moodFor(input.tone),
    `Establishing illustration for chapter ${input.actIndex} of a gentle family fantasy ` +
      `story called ${input.storyline}. The chapter is called "${input.actTitle}".`,
    input.beats.length > 0
      ? `Things that happen in it, for scenery only — draw the place, not the plot: ` +
        `${input.beats.join("; ")}.`
      : "",
    "No characters from the party. This is the place, waiting for them.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Somebody the party met.
 *
 * A portrait rather than a scene, and framed kindly on purpose. Every NPC in
 * this game is somebody the family might end up fond of — the design rule is
 * that monsters are misunderstood — so nobody gets drawn as a threat, including
 * the ones introduced as one.
 */
export function npcPortraitPrompt(input: {
  name: string;
  /** What the story recorded about them. */
  description: string;
  tone: string;
}): string {
  return [
    STYLE,
    `Character portrait, head and shoulders, facing the viewer, plain soft background. ` +
      `Kind and characterful. Nothing frightening, no injuries, no weapons.`,
    moodFor(input.tone),
    `The character is ${input.name}. ${input.description}`,
    "Draw them as somebody a child would want to talk to, whatever they are.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A place the party keeps coming back to.
 *
 * The journey line already folds repeat visits into a single named stop, so a
 * family can see which places became *theirs*. Those are the ones worth having
 * a picture of.
 */
export function sceneryPrompt(input: {
  place: string;
  storyline: string;
  tone: string;
  /** Anything the story has said about it. Optional. */
  detail?: string | null;
}): string {
  return [
    STYLE,
    SUBJECT_RULES,
    moodFor(input.tone),
    `A place in a gentle family fantasy story called ${input.storyline}: ${input.place}.`,
    input.detail ? `What is known about it: ${input.detail}` : "",
    "Empty of people. Wide, and painted as somewhere you could go back to.",
  ]
    .filter(Boolean)
    .join("\n");
}
