/**
 * What to offer her when a level hands over a skill.
 *
 * The game has two ways a skill arrives, and they are different on purpose.
 *
 * **Practised** — four goes at climbing turns into Climbing, without anybody
 * deciding it should. The game was watching, which is the nicest thing it does.
 *
 * **Chosen** — one at every level after the second. This is the other half a
 * child wants: not only to be surprised, but to have a plan. A girl who has
 * decided her adventurer is going to be the one who talks to animals should be
 * able to make that happen rather than hope for it.
 *
 * So the offer is both. Three suggestions drawn from what she has actually been
 * doing and what her calling knows — the "we noticed" moment — and the whole
 * list underneath, because a ten-year-old who wants Star-Reading should simply
 * be able to have Star-Reading. The suggestions are the default; browsing is
 * the escape hatch, and neither is hidden from her.
 */

import { ALL_SKILLS, skillGroupsFor, ARCHETYPES } from "@/lib/game/character-options";
import { chosenSkillsFor } from "@/lib/game/rules";

/** How many are suggested before the full list. Three, like the knack offer. */
export const SKILLS_SUGGESTED = 3;

export type SkillOfferInput = {
  archetype: string;
  level: number;
  /** Skills already on her sheet, however they arrived. */
  held: string[];
  /**
   * How many of her level-up picks she has already spent — rows with a
   * `chosenAtLevel`. Practised skills do not count against this, which is what
   * stops a girl who learned four things by doing them from losing her choices.
   */
  chosen: number;
  /** What she keeps trying, most-attempted first. Drives the suggestions. */
  practices: { key: string; label: string; attempts: number }[];
};

/** How many skills she may still choose, right now. */
export function skillPicksUnspent(input: { level: number; chosen: number }): number {
  // Clamped, and the clamp is load-bearing rather than defensive. The
  // entitlement was one skill per level and is now one per three, so every
  // adventurer already in a household holds more than the new rule allows —
  // Orin is level 4 with four skills where the rule now says three. Nothing is
  // taken off her sheet; she just has nothing waiting until the ladder catches
  // up with her, which is exactly the slowdown that was asked for.
  return Math.max(0, chosenSkillsFor(input.level) - input.chosen);
}

/**
 * The three we lead with.
 *
 * Ordered by how much this character has earned the suggestion: something she
 * has been visibly attempting first, then her calling's own three, then the
 * rest. A suggestion that has nothing to do with her is worse than no
 * suggestion, because it makes the "we noticed" feeling into a lie.
 */
export function suggestedSkills(input: SkillOfferInput): string[] {
  const held = new Set(input.held.map((skill) => skill.toLocaleLowerCase()));
  const available = ALL_SKILLS.filter((skill) => !held.has(skill.toLocaleLowerCase()));

  const own =
    ARCHETYPES.find(
      (option) => option.value.toLocaleLowerCase() === input.archetype.trim().toLocaleLowerCase(),
    )?.skills ?? [];

  const score = (skill: string): number => {
    const lower = skill.toLocaleLowerCase();

    // Something she keeps doing. Matched loosely because the storyteller's word
    // for it ("climbing") and the skill's name ("Climbing") agree often but not
    // always, and a near miss is still a better suggestion than a stranger.
    const practice = input.practices.find(
      (entry) => lower.includes(entry.key) || entry.key.includes(lower.split(" ")[0]),
    );
    if (practice) return 100 + practice.attempts;

    if (own.includes(skill)) return 50;
    return 0;
  };

  return [...available]
    .sort((a, b) => {
      const difference = score(b) - score(a);
      // Ties break on the name so the three do not shuffle between page loads —
      // a list that reorders itself while a child is reading it is unkind.
      return difference !== 0 ? difference : a.localeCompare(b);
    })
    .slice(0, SKILLS_SUGGESTED);
}

/** Why a suggestion is being made, in her own terms. Empty when it is just her calling. */
export function reasonFor(skill: string, input: SkillOfferInput): string {
  const lower = skill.toLocaleLowerCase();
  const practice = input.practices.find(
    (entry) => lower.includes(entry.key) || entry.key.includes(lower.split(" ")[0]),
  );
  if (practice) return "you keep doing this";

  const own = ARCHETYPES.find(
    (option) => option.value.toLocaleLowerCase() === input.archetype.trim().toLocaleLowerCase(),
  );
  return own?.skills.includes(skill) ? own.value : "";
}

/**
 * Everything she could take, grouped for browsing, minus what she already has.
 *
 * Groups with nothing left in them are dropped rather than shown empty — a
 * heading over no options reads as something broken.
 */
export function browsableSkills(input: SkillOfferInput): { label: string; skills: string[] }[] {
  const held = new Set(input.held.map((skill) => skill.toLocaleLowerCase()));

  return skillGroupsFor(input.archetype)
    .map((group) => ({
      label: group.label,
      skills: group.skills.filter((skill) => !held.has(skill.toLocaleLowerCase())),
    }))
    .filter((group) => group.skills.length > 0);
}

/**
 * Whether she may take this particular skill.
 *
 * Recomputed on the server when a choice is submitted, exactly as the knack
 * chooser does. The offer shown in a browser is a convenience; this is the rule.
 */
export function mayChoose(skill: string, input: SkillOfferInput): boolean {
  if (skillPicksUnspent(input) <= 0) return false;
  if (!ALL_SKILLS.includes(skill)) return false;
  return !input.held.some((have) => have.toLocaleLowerCase() === skill.toLocaleLowerCase());
}
