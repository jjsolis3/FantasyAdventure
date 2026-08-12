/**
 * Prints the art prompts for every adventure, ready to paste into whatever
 * drawing tool a family likes.
 *
 * Usage:
 *   npm run art:prompts               every adventure
 *   npm run art:prompts -- the-star   only ones whose slug contains "the-star"
 *
 * Reads the same array `prisma/seed.ts` seeds the database from, so writing a
 * new adventure and re-running this gives you its prompts with no second place
 * to keep in step.
 *
 * Deliberately prints rather than writing files: where the pictures end up is
 * the family's business, and half of them will be redrawn by hand anyway.
 */

import { storylines } from "../prisma/storylines.ts";
import { chapterArtPrompt, npcPortraitPrompt, sceneryPrompt } from "../lib/ai/art-prompts.ts";

const filter = process.argv[2]?.toLowerCase() ?? "";
const chosen = filter
  ? storylines.filter((story) => story.slug.toLowerCase().includes(filter))
  : storylines;

if (chosen.length === 0) {
  console.error(`No adventure matched "${filter}".`);
  console.error(`Try one of: ${storylines.map((story) => story.slug).join(", ")}`);
  process.exit(1);
}

const rule = "─".repeat(78);

console.log(`\n${rule}`);
console.log("ART PROMPTS");
console.log(rule);
console.log(
  "\nOne picture per chapter. Save each as WEBP or PNG, roughly 1024×1024 or wider,\n" +
    "then upload it against the chapter it belongs to.\n" +
    "\nEvery prompt already carries the game's own style line, so pictures made here\n" +
    "and pictures the app generates during play will look like the same game.",
);

for (const story of chosen) {
  console.log(`\n\n${rule}`);
  console.log(`${story.title}`);
  console.log(`${story.slug} · ${story.defaultTone.toLowerCase()}`);
  console.log(rule);

  for (const act of story.acts) {
    console.log(`\n\n### Chapter ${act.index} — ${act.title}`);
    console.log(`### suggested filename: ${story.slug}/act-${act.index}.webp\n`);
    console.log(
      chapterArtPrompt({
        storyline: story.title,
        tone: story.defaultTone,
        actIndex: act.index,
        actTitle: act.title,
        beats: [...act.beats],
      }),
    );
  }
}

// The two kinds of picture that cannot be listed in advance, because who the
// party meets and where they end up is not known until they get there.
console.log(`\n\n${rule}`);
console.log("TEMPLATES — for people and places you meet along the way");
console.log(rule);

console.log("\n\n### Somebody the party met\n");
console.log(
  npcPortraitPrompt({
    name: "<their name>",
    description: "<what the story said about them — one or two sentences>",
    tone: "<COZY | ADVENTUROUS | SPOOKY>",
  }),
);

console.log("\n\n### A place they keep coming back to\n");
console.log(
  sceneryPrompt({
    place: "<the place>",
    storyline: "<the adventure it is in>",
    tone: "<COZY | ADVENTUROUS | SPOOKY>",
    detail: "<anything the story has said about it>",
  }),
);

console.log(`\n${rule}\n`);
