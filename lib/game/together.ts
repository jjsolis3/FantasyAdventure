/**
 * Two people, one plan.
 *
 * ## What was missing
 *
 * Bonds only ever rose from one thing: a `bondMoment`, which the storyteller is
 * told to report *"only when one genuinely helped, protected, encouraged or
 * comforted the other"*. One-directional care — standing between her and the
 * noise, walking beside her. Lovely, and only half of what happens at a table.
 *
 * The other half is two girls working something out and going at it together,
 * and the game could not see it at all. Adjudication read every action on its
 * own, so "I boost Rowan up" and "I reach for the latch" were two unrelated
 * things that happened to occur in the same room. The most cooperative turn an
 * evening produces was worth exactly as much as two people ignoring each other.
 *
 * ## How it is found
 *
 * Out of the actions themselves, at adjudication — the stage that is already
 * reading all of them at once and is the only place where the *relationship
 * between* two actions is visible.
 *
 * This matters more than it sounds. There is no button for it and no box to
 * tick, so it cannot be claimed, only done: to get it, two children have to
 * write two actions that genuinely serve one plan. If they end up doing that
 * every single turn, that is not an exploit, that is the entire point.
 *
 * ## What it is worth
 *
 * Deliberately small, and worth explaining why. `Lend a Hand` — a Family Move
 * that has to be earned through a bond and spent once per scene — is +2. This
 * is free, repeatable, and available from the first evening. If it paid the
 * same, the moves a family works up to would be worth less than the thing
 * anybody can do for nothing.
 *
 * So: +1 on the roll, and a bond between every pair in the plan. The bond is
 * the real prize. It is the second source those relationships have ever had,
 * and it rewards the kind of cooperation that has nothing to do with comforting
 * anybody — the kind where two people just have a good idea at the same time.
 */

/** What one shared plan is worth on every roll inside it. */
export const TOGETHER_BONUS = 1;

/** A plan more than one of them is serving, resolved to party members. */
export type SharedPlan = {
  /** Character ids, at least two, all of them in the party. */
  characterIds: string[];
  /** Names in the same order, for the card and the prose. */
  names: string[];
  plan: string;
};

/**
 * Turns what the model said into something the engine can trust.
 *
 * Everything here is a way the claim can be wrong. A model will name a
 * character who is not in the party, name the same girl twice, decide one
 * person is a team, or report the same pairing three times in one turn — and
 * each of those, unchecked, is either a crash or a child being quietly paid
 * twice for one idea.
 */
export function resolvePlans(
  claimed: { characters: string[]; plan: string }[],
  party: { characterId: string; name: string }[],
): SharedPlan[] {
  const byName = new Map(party.map((member) => [member.name.toLocaleLowerCase(), member]));
  const plans: SharedPlan[] = [];
  const seen = new Set<string>();

  for (const entry of claimed) {
    const members: { characterId: string; name: string }[] = [];

    for (const name of entry.characters) {
      const member = byName.get(name.trim().toLocaleLowerCase());
      // Unknown names are dropped rather than failing the turn. The storyteller
      // inventing a cousin should not cost the table its move.
      if (!member) continue;
      if (members.some((already) => already.characterId === member.characterId)) continue;
      members.push(member);
    }

    // One person is not a team, however the plan is worded.
    if (members.length < 2) continue;

    // The same pairing reported twice in one turn is one plan, not two. Sorted
    // so that "Mira and Rowan" and "Rowan and Mira" are recognised as the same.
    const key = members
      .map((member) => member.characterId)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    plans.push({
      characterIds: members.map((member) => member.characterId),
      names: members.map((member) => member.name),
      plan: entry.plan.trim(),
    });
  }

  return plans;
}

/** Every pair inside a plan, so each of them can earn a bond. */
export function pairsIn(plan: SharedPlan): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < plan.characterIds.length; i += 1) {
    for (let j = i + 1; j < plan.characterIds.length; j += 1) {
      pairs.push([plan.characterIds[i], plan.characterIds[j]]);
    }
  }
  return pairs;
}

/** The plan a given character is part of, if any. */
export function planFor(plans: SharedPlan[], characterId: string): SharedPlan | undefined {
  return plans.find((plan) => plan.characterIds.includes(characterId));
}

/**
 * How a shared plan is said out loud — "Mira and Rowan", "Mira, Rowan and Bo".
 *
 * Its own function because the two-name case is the common one and reads badly
 * with a comma, and because the same phrasing has to appear on the dice card,
 * in the storyteller's instructions and in the milestone the table is shown.
 * Three copies of a list-joiner is three chances for the television and the
 * phone to describe the same moment differently.
 */
export function namesOf(plan: SharedPlan): string {
  const names = plan.names;
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What the storyteller is told, so one plan is narrated as one thing. */
export function togetherGuidance(plans: SharedPlan[]): string {
  if (plans.length === 0) return "";

  const lines = plans.map((plan) => `- ${namesOf(plan)}: ${plan.plan}`);
  return (
    `THEY ARE WORKING TOGETHER:\n${lines.join("\n")}\n` +
    `Narrate each of these as ONE thing two people did, not as two things that ` +
    `happened near each other. Name both of them in the same sentence. This is ` +
    `the best thing that happens at this table — make it look like it.`
  );
}
