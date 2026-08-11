/**
 * Getting better at what you keep doing.
 *
 * Skill experience used to be awarded only when a check happened to name a
 * skill the character already had. A girl who said *"I climb the drainpipe"* —
 * with nothing on her sheet about climbing — rolled, earned experience toward
 * her level, and got nothing at all that would make climbing easier next time.
 * The attempt was forgotten the moment the dice landed.
 *
 * Which is the opposite of how anybody learns anything, and the opposite of
 * what a table expects. The first time you try to climb it you probably fail;
 * the fourth time, you are someone who climbs.
 *
 * So every check is now filed under the *kind* of thing it was — the storyteller
 * names it, in a word or two — and enough attempts at the same kind of thing
 * turns into a real skill on the sheet.
 */

import { MAX_SKILL_RANK } from "@/lib/game/rules";

/**
 * How many attempts before it becomes a skill.
 *
 * Four, so it means something. At two, a child gets a skill for repeating
 * herself once and the sheet fills with noise; much higher and the payoff is
 * too far away to connect to the thing she did.
 */
export const ATTEMPTS_TO_LEARN = 4;

/**
 * The most skills anybody can carry.
 *
 * A sheet is read at a glance across a kitchen table. Past half a dozen it
 * stops being a character and starts being a spreadsheet — and the interesting
 * question ("what am I good at?") stops having an answer.
 */
export const MAX_SKILLS = 6;

/**
 * Folds what the storyteller called it into something countable.
 *
 * It will describe the same act three different ways across three turns —
 * "climbing", "Climb", "climbing up" — and three separate ledger rows would
 * mean she never reaches four of anything. Stems the obvious English endings
 * rather than pulling in a stemmer: this only has to collapse a handful of
 * spellings of the same short verb.
 */
export function practiceKey(label: string): string {
  const cleaned = label
    .toLocaleLowerCase()
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  // The first word carries the meaning; "climbing up a wall" is climbing.
  const head = cleaned.split(" ")[0] ?? "";

  return head
    .replace(/ies$/, "y")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/es$/, "")
    .replace(/s$/, "");
}

export type PracticeRow = {
  key: string;
  label: string;
  attempts: number;
  learnedAtTurn: number | null;
};

export type SkillRow = { name: string; rank: number };

/**
 * Whether this practice should become a skill now.
 *
 * Four honest tries, nothing on the sheet that already covers it, and room left
 * to carry another. Deliberately not gated on succeeding: a child who has
 * failed to pick a lock four times has learned a great deal about locks, and
 * telling her she has not is both wrong and unkind.
 */
export function readyToLearn(
  practice: PracticeRow,
  skills: SkillRow[],
  /** How many she may carry. Wider than the default for a Fast Learner. */
  room: number = MAX_SKILLS,
): boolean {
  if (practice.learnedAtTurn !== null) return false;
  if (practice.attempts < ATTEMPTS_TO_LEARN) return false;
  if (skills.length >= room) return false;
  return !coveredBy(practice.key, skills);
}

/**
 * Whether something on the sheet already covers this kind of thing.
 *
 * Matched on the practice key against every word of each skill name, so
 * "Speak with Animals" already covers "speaking" and she does not end up with
 * both. Loose on purpose — a near miss costs her a duplicate skill, which is
 * worse than a near miss costing her nothing.
 */
export function coveredBy(key: string, skills: SkillRow[]): boolean {
  if (key.length < 3) return false;

  return skills.some((skill) =>
    skill.name
      .toLocaleLowerCase()
      .split(/\s+/)
      .some((word) => {
        const stem = practiceKey(word);
        return stem.length >= 3 && (stem.startsWith(key) || key.startsWith(stem));
      }),
  );
}

/** "Wren has been climbing enough to be good at it — Climbing, rank 1." */
export function learnedMessage(characterName: string, label: string): string {
  return `${characterName} has done enough ${label} to be properly good at it. ${titleCase(label)} — rank 1.`;
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

/**
 * What a skill name should look like on a sheet.
 *
 * The storyteller writes "climbing"; a sheet wants "Climbing".
 */
export function skillNameFrom(label: string): string {
  return titleCase(label.trim()).slice(0, 40);
}

/** Whether a rank is as far as this skill goes. */
export function atSkillCap(rank: number): boolean {
  return rank >= MAX_SKILL_RANK;
}

// ---- Things you have not grown into yet -------------------------------------

export type Requirement = {
  requiresSkill: string | null;
  requiresRank: number | null;
  requiresLevel: number | null;
};

export type Locked = { locked: false } | { locked: true; needs: string };

/**
 * Whether an adventurer can use a thing she is carrying.
 *
 * The alternative to a gear shop. A silver flute she cannot play yet is a far
 * better reason to want to grow than a price tag is — it costs nothing, it
 * takes nothing from anybody else, and it turns "I got better" into "I can do
 * something today that I could not do last week".
 *
 * It never stops her *carrying* it, or giving it away, or spending it on a
 * quest. Only from using it, which is the storyteller's business to honour.
 */
export function lockedFor(
  requirement: Requirement,
  character: { level: number; skills: SkillRow[] },
): Locked {
  if (requirement.requiresLevel !== null && character.level < requirement.requiresLevel) {
    return { locked: true, needs: `level ${requirement.requiresLevel}` };
  }

  if (requirement.requiresSkill) {
    const needed = Math.max(1, requirement.requiresRank ?? 1);
    const held = character.skills.find(
      (skill) => skill.name.toLocaleLowerCase() === requirement.requiresSkill!.toLocaleLowerCase(),
    );

    // The rank is named whenever it is more than the first, whether or not she
    // has any of the skill. "Needs Small Wonders" would send a child off to
    // learn it and leave her still unable to use the thing.
    const wanted = needed > 1 ? `${requirement.requiresSkill} rank ${needed}` : requirement.requiresSkill;

    if (!held || held.rank < needed) return { locked: true, needs: wanted };
  }

  return { locked: false };
}

/** Whether a thing carries any requirement at all. Most do not. */
export function hasRequirement(requirement: Requirement): boolean {
  return (
    requirement.requiresLevel !== null ||
    (requirement.requiresSkill !== null && requirement.requiresSkill !== "")
  );
}
