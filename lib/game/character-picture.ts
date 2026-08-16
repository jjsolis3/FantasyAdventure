/**
 * What picture an adventurer gets, and where it comes from.
 *
 * Same shape as `lib/game/scene-picture.ts`, and for the same reason: several
 * surfaces need the same answer — her own sheet, the party list, the round
 * board, the television — and four copies of a precedence rule is four chances
 * for two screens to disagree about somebody's face.
 *
 * The order, most specific first:
 *
 *   1. **A drawing somebody made.** Photographed and uploaded. Nothing beats a
 *      child's felt-tip drawing of her own adventurer, and nothing here will
 *      ever overwrite one.
 *   2. **A portrait drawn from the wardrobe.** Only if a drawing service is
 *      configured, only when somebody asked for it, and it says so when the
 *      outfit has changed since.
 *   3. **A crest.** Two colours from the palette she chose and the first letter
 *      of her name, drawn as inline SVG.
 *
 * The third rung is the one that made this worth building. Most households will
 * never configure a drawing model, and a dressing room that produces nothing
 * visible is a dressing room nobody opens twice. A crest costs no bytes, no
 * request and no provider, and it changes colour when she changes hers — which
 * is the smallest possible way of saying *the choosing mattered*.
 */

import type { Look } from "@/lib/game/wardrobe";
import { SLOTS, inkFor } from "@/lib/game/wardrobe";

export type CharacterPicture =
  /** Somebody drew this adventurer and photographed it. */
  | { source: "DRAWN"; url: string }
  /**
   * A drawing service made one from the wardrobe.
   *
   * `stale` when she has changed clothes since — the picture is still hers and
   * still worth showing, it is simply out of date, and saying so is better than
   * either hiding it or letting it quietly misrepresent her.
   */
  | { source: "GENERATED"; url: string; stale: boolean }
  /** Two colours and a letter. Always available. */
  | { source: "CREST"; ink: string; wash: string; letter: string };

/**
 * What a look hashes to, for noticing that it has changed.
 *
 * The slot values joined in a fixed order rather than a real hash: it is short,
 * it is readable in the database when something looks wrong, and the only
 * question ever asked of it is whether two of them are equal.
 */
export function lookKey(look: Look): string {
  return SLOTS.map((slot) => (look[slot] ?? "").trim()).join("|");
}

export function characterPicture(character: {
  id: string;
  name: string;
  look: Look;
  portraitVersion: number | null;
  art: { version: number; lookKey: string } | null;
}): CharacterPicture {
  if (character.portraitVersion !== null) {
    return {
      source: "DRAWN",
      url: `/api/characters/${character.id}/portrait?v=${character.portraitVersion}`,
    };
  }

  if (character.art) {
    return {
      source: "GENERATED",
      url: `/api/characters/${character.id}/art?v=${character.art.version}`,
      stale: character.art.lookKey !== lookKey(character.look),
    };
  }

  const { ink, wash } = inkFor(character.look);
  return {
    source: "CREST",
    ink,
    wash,
    // Codepoint-aware, so a name starting with an emoji or an accented letter
    // gets its own character rather than half of one.
    letter: [...character.name.trim()][0]?.toLocaleUpperCase() ?? "?",
  };
}
