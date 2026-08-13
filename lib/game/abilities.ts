/**
 * Everything a character can spend once, in one list.
 *
 * Three separate systems arrived at the same shape without ever meeting:
 *
 *   - **Archetype signatures.** "Spendable once a scene", per their own doc
 *     comment. Nothing counted, and the prompt told the storyteller it was
 *     something the character *can always* do — so the last place the rule
 *     could have been enforced was told the opposite of the rule.
 *   - **Steady Hand**, earned at skill rank 2. "Once a chapter, do something
 *     with Climbing without rolling for it." Nothing counted.
 *   - **Two knacks**, Good Listener and The Loud One. "Once a chapter."
 *     Nothing counted.
 *
 * All three were real promises made in the text a child reads, and all three
 * were honour-system rules in a game whose whole point is that the server rolls
 * the dice so the fiction cannot cheat. Family Moves were the one limit that
 * was ever true, so this is built the way that one was.
 *
 * Collected here rather than left where each was defined because two very
 * different callers need the same answer — the picker at the table, and the
 * prompt the storyteller reads — and a second list would drift from the first
 * within a month.
 */

import { signaturesFor, type SignatureEffect } from "@/lib/game/character-options";
import { KNACKS } from "@/lib/game/knacks";
import { RANK_ABILITIES } from "@/lib/game/practice";

/** Matches the `AbilityKind` enum in the schema. */
export type AbilityKind = "SIGNATURE" | "KNACK" | "RANK";

/**
 * How long a spend lasts.
 *
 * A signature is once a *scene*, because it is the thing the calling does and
 * a whole chapter without it would make the archetype feel absent. The earned
 * ones are once a *chapter*, because they are stronger and because a chapter is
 * roughly an evening, which is the unit a family actually feels.
 */
export type AbilityScope = "SCENE" | "ACT";

export type Ability = {
  kind: AbilityKind;
  /** Unique within a character. Stored in `AbilityUse.abilityKey`. */
  key: string;
  name: string;
  /** Shown to the player, in her words. */
  blurb: string;
  scope: AbilityScope;
  effect: SignatureEffect;
  /** Told to the Game Master when she spends it. */
  narrationHint: string;
};

/**
 * The window a spend is measured in.
 *
 * `scene:<id>` or `act:<index>`, and both are only ever compared within one
 * campaign — which the unique constraint gets for free by keying on the
 * character, since a character is in one party at a time.
 */
export function windowKeyFor(scope: AbilityScope, sceneId: string, actIndex: number): string {
  return scope === "SCENE" ? `scene:${sceneId}` : `act:${actIndex}`;
}

/** Steady Hand is per skill, so its key has to carry which one. */
export function rankAbilityKey(skillName: string): string {
  return `rank2:${skillName.toLowerCase()}`;
}

/** The knacks that promise a limit. The rest are always-on and belong nowhere near this. */
const LIMITED_KNACKS: Record<string, { effect: SignatureEffect }> = {
  good_listener: { effect: { kind: "NARRATIVE" } },
  // "Everyone else's next roll goes better. Never your own." — the same shape
  // as the Songkeeper's signature, so it is the same number.
  the_loud_one: { effect: { kind: "BOOST_OTHERS", amount: 2 } },
};

export type CharacterAbilityInput = {
  archetype: string;
  /** Which signatures have arrived. A second one turns up at level 5. */
  level: number;
  knackKeys: string[];
  skills: { name: string; rank: number }[];
};

/**
 * Everything this character could spend, spent or not.
 *
 * Deliberately says nothing about what she has *already* spent — that needs the
 * database, and keeping this pure means the catalogue can be tested without one
 * and reasoned about on its own. `unspentAbilities` puts the two together.
 */
export function abilitiesFor(character: CharacterAbilityInput): Ability[] {
  const abilities: Ability[] = [];

  // The first one keeps the key it has always had. In-flight `AbilityUse` rows
  // name it, and a rename would quietly hand every Guardian mid-scene their
  // signature back — so the second gets a new key rather than both being
  // renumbered.
  for (const signature of signaturesFor(character.archetype, character.level)) {
    abilities.push({
      kind: "SIGNATURE",
      key:
        signature.fromLevel <= 1
          ? `signature:${character.archetype.toLowerCase()}`
          : `signature:${character.archetype.toLowerCase()}:${signature.fromLevel}`,
      name: signature.name,
      blurb: signature.blurb,
      scope: "SCENE",
      effect: signature.effect,
      narrationHint: signature.narrationHint,
    });
  }

  for (const key of character.knackKeys) {
    const limited = LIMITED_KNACKS[key];
    if (!limited) continue;
    const knack = KNACKS.find((entry) => entry.key === key);
    if (!knack) continue;

    abilities.push({
      kind: "KNACK",
      key: `knack:${knack.key}`,
      name: knack.name,
      blurb: knack.blurb,
      scope: "ACT",
      effect: limited.effect,
      narrationHint: knack.narrationHint ?? knack.blurb,
    });
  }

  // Steady Hand, once per skill that has reached rank 2. A girl who has
  // practised two things to that point genuinely has two of these, and they are
  // different abilities — one is "climb it without rolling", the other is "hum
  // it without rolling" — so they are counted separately.
  const steadyHand = RANK_ABILITIES.find((entry) => entry.rank === 2);
  if (steadyHand) {
    for (const skill of character.skills) {
      if (skill.rank < steadyHand.rank) continue;
      abilities.push({
        kind: "RANK",
        key: rankAbilityKey(skill.name),
        name: `${steadyHand.name} — ${skill.name}`,
        blurb: steadyHand.blurb(skill.name),
        scope: "ACT",
        effect: { kind: "AUTO_SUCCEED" },
        narrationHint: steadyHand.hint(skill.name),
      });
    }
  }

  return abilities;
}

/** One spend already recorded, as the database holds it. */
export type SpentAbility = { abilityKey: string; windowKey: string };

/**
 * What she can still spend, here, now.
 *
 * The window is computed per ability rather than once, because the two scopes
 * are measured differently and mixing them up would be invisible — a signature
 * checked against the chapter would silently become once an evening.
 */
export function unspentAbilities(
  abilities: Ability[],
  spent: SpentAbility[],
  sceneId: string,
  actIndex: number,
): Ability[] {
  const used = new Set(spent.map((entry) => `${entry.abilityKey}@${entry.windowKey}`));
  return abilities.filter(
    (ability) => !used.has(`${ability.key}@${windowKeyFor(ability.scope, sceneId, actIndex)}`),
  );
}

/** How the limit is described to a player, and to the storyteller. */
export function scopeLabel(scope: AbilityScope): string {
  return scope === "SCENE" ? "Once a scene" : "Once a chapter";
}
