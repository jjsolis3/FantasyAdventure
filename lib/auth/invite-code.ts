import { randomInt } from "node:crypto";

// Deliberately free of any project imports. The seed script runs under tsx
// inside the container, where the `@/` path alias is not configured, so
// anything it reaches must resolve by relative path alone and must not drag in
// the Prisma client.

// Excludes look-alike characters (0/O, 1/I/L) so a code can be read aloud
// across the kitchen table or copied off a screen without ambiguity.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_SIZE = 4;
const GROUPS = 2;

function randomGroups(): string {
  const groups: string[] = [];
  for (let group = 0; group < GROUPS; group += 1) {
    let chunk = "";
    for (let index = 0; index < GROUP_SIZE; index += 1) {
      chunk += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(chunk);
  }
  return groups.join("-");
}

/** Generates a code shaped like `HEARTH-K3M9-PQ7T`. */
export function generateInviteCode(): string {
  return `HEARTH-${randomGroups()}`;
}

/**
 * Generates the code that brings another household into one adventure, shaped
 * like `PARTY-K3M9-PQ7T`.
 *
 * Different prefix, same alphabet: the two are read aloud in the same house and
 * do entirely different things, so they should not be mistakable for each other
 * while still being equally easy to say.
 */
export function generateJoinCode(): string {
  return `PARTY-${randomGroups()}`;
}

/**
 * Generates the code that hands an adventurer to another account, shaped like
 * `HAND-K3M9-PQ7T`.
 *
 * A third prefix rather than a third format: all three of these get read aloud
 * in the same kitchen, and the word at the front is how anybody tells which one
 * they are holding.
 */
export function generateHandoverCode(): string {
  return `HAND-${randomGroups()}`;
}

/** Normalises user input so spacing and case do not matter. */
export function normaliseInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
