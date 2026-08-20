/**
 * Starting an adventurer again.
 *
 * A destructive thing, so it lives in one file with the whole of what it does
 * written down, rather than spread across a route handler and a form.
 *
 * ## Why an administrator rather than the player
 *
 * Everything on a sheet is earned, one point and one skill at a time, and the
 * whole design of growth is that it is one-way: stats never go back down,
 * because refunds turn a character into a puzzle to be optimised between
 * chapters. A reset is the one exception, and a button that undoes an evening's
 * play does not belong next to the buttons a nine-year-old presses. Asking a
 * grown-up is the point, not an obstacle — it means a reset is always something
 * two people agreed on.
 *
 * ## What goes and what stays
 *
 * The line is between what she *earned* and who she *is*.
 *
 *   Earned, and cleared: experience, level, skills, what she has practised,
 *   knacks, everything in her pockets, keepsakes, people she has met, and any
 *   once-a-scene move she has spent.
 *
 *   Hers, and kept: her name, her people, her calling, her pronouns, her age,
 *   how she is described, and her portrait.
 *
 * Two decisions inside that are worth stating.
 *
 * **Bonds are turned down, not deleted.** A relationship row holds two things:
 * that these two are sisters — which somebody chose and no reset should touch —
 * and how close they have grown, which is earned. So the row stays and the
 * level goes back to nothing.
 *
 * **Her numbers are given, not guessed.** Stats are built once from a fixed
 * budget and then only ever rise, and nothing in the game can edit them
 * afterwards. That means the engine knows exactly how many points growth added
 * but has no idea *which* stats they went into — and a wrong guess here would
 * be unfixable without deleting her. So the caller supplies the spread, checked
 * against the same rule the builder uses. `suggestedBuild` offers a starting
 * point; a person confirms it.
 *
 * ## Two different things people call "resetting"
 *
 * The first version of this had one mode, and a household asking a perfectly
 * reasonable question found the gap in it: *"should I reset their stats, and
 * remove the newly received skills, so it can be applied with the new growth
 * rules — I just don't want the current characters to be penalised for no
 * reason."* Nothing here could do that. The only button available threw away
 * four evenings to fix a spread of numbers.
 *
 * So there are two:
 *
 * **Start again** — the original. Back to the day she was built: level 1, no
 * experience, nothing earned, and she picks her two starting skills on the way
 * out so she leaves as finished an adventurer as the builder makes.
 *
 * **Re-lay her numbers** — she keeps everything. Level, experience, skills,
 * knacks, pockets, keepsakes, the people she knows and how close her bonds have
 * grown. What changes is the stat spread, re-laid against today's budget, and
 * because `buildBudget` is written back at the same time, every point her
 * experience has earned comes back as a point she may spend again on her own
 * sheet. It is the tool for "the rules moved underneath her", and it costs her
 * nothing.
 *
 * Level and experience are settable on that path, because the reason to reach
 * for it is usually that one of them is wrong. Never below the level the
 * experience already justifies, though — `levelReached` is a high-water mark
 * everywhere else in the game, and a sheet that claimed level 2 on 400
 * experience would be corrected by the next turn anybody played.
 */

import { db } from "@/lib/db";
import { ALL_SKILLS } from "@/lib/game/character-options";
import {
  MAX_LEVEL,
  SKILLS_PER_CHARACTER,
  STATS,
  STAT_BUDGET,
  STAT_MAX,
  STAT_MIN,
  levelFor,
  statColumns,
  statPointsEarned,
  statsOf,
  validateStats,
  xpForLevel,
  type StatBlock,
} from "@/lib/game/rules";

/** What a reset would take away, counted before anybody agrees to it. */
export type ResetPreview = {
  characterId: string;
  name: string;
  /**
   * As written on her sheet, so every sentence on the page can be built from
   * them. The screen said "Her numbers" over an adventurer called Orin whose
   * player had chosen he/him — a small thing that reads as not having listened.
   */
  pronouns: string | null;
  /** Drives the skill suggestions on the way out of a full reset. */
  archetype: string;
  level: number;
  xp: number;
  stats: StatBlock;
  skills: number;
  practices: number;
  knacks: number;
  items: number;
  keepsakes: number;
  acquaintances: number;
  /** Bonds that have grown past nothing, and so have something to lose. */
  bonds: number;
  /**
   * Adventures she is currently in that are still going.
   *
   * Not a refusal — an administrator resetting a character mid-story usually
   * means the story was a test — but it is the one thing that could surprise
   * somebody, so it is counted and shown rather than discovered afterwards.
   */
  activeAdventures: string[];
};

export async function previewReset(characterId: string): Promise<ResetPreview | null> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      name: true,
      pronouns: true,
      archetype: true,
      level: true,
      xp: true,
      ...Object.fromEntries(STATS.map((stat) => [stat, true])),
      _count: {
        select: {
          skills: true,
          practices: true,
          knacks: true,
          inventory: true,
          keepsakes: true,
          acquaintances: true,
        },
      },
      partyMemberships: {
        where: { campaign: { status: "ACTIVE" } },
        select: { campaign: { select: { title: true } } },
      },
      relationshipsA: { where: { bondLevel: { gt: 0 } }, select: { id: true } },
      relationshipsB: { where: { bondLevel: { gt: 0 } }, select: { id: true } },
    },
  });
  if (!character) return null;

  return {
    characterId: character.id,
    name: character.name,
    pronouns: character.pronouns,
    archetype: character.archetype,
    level: character.level,
    xp: character.xp,
    stats: statsOf(character),
    skills: character._count.skills,
    practices: character._count.practices,
    knacks: character._count.knacks,
    items: character._count.inventory,
    keepsakes: character._count.keepsakes,
    acquaintances: character._count.acquaintances,
    bonds: character.relationshipsA.length + character.relationshipsB.length,
    activeAdventures: character.partyMemberships.map((member) => member.campaign.title),
  };
}

/**
 * A legal build to pre-fill the form with.
 *
 * Scaled proportionally rather than shaved off the top, and the difference
 * matters more than it looks. Taking a point from the highest stat repeatedly
 * is the obvious approach and it flattens people: a Guardian at 8/5/4/3 comes
 * out as 3/3/3/3 — twelve points, perfectly legal, and no longer recognisable
 * as the girl who was strong. Scaling keeps the shape, so the same character
 * suggests 5/3/2/2 and still reads as herself.
 *
 * Only ever a suggestion. The point of putting the numbers in a form is that
 * somebody who remembers how she was built can correct them before agreeing.
 */
export function suggestedBuild(stats: StatBlock): StatBlock {
  const legal = validateStats(stats);
  if (legal.ok) return { ...stats };

  const total = STATS.reduce((sum, stat) => sum + stats[stat], 0);
  const build = {} as StatBlock;

  // The whole part of each scaled share, floored so the total can only be short
  // and never over — a shortfall is easy to hand out, an overshoot is not.
  const shares = STATS.map((stat) => {
    const exact = total > 0 ? (stats[stat] * STAT_BUDGET) / total : STAT_BUDGET / STATS.length;
    const whole = Math.min(STAT_MAX, Math.max(STAT_MIN, Math.floor(exact)));
    build[stat] = whole;
    return { stat, remainder: exact - Math.floor(exact) };
  });

  // The rounding leftovers go to whoever was closest to the next point, which
  // keeps the order of the stats — the highest stays the highest.
  shares.sort((a, b) => b.remainder - a.remainder);

  let spent = STATS.reduce((sum, stat) => sum + build[stat], 0);
  while (spent < STAT_BUDGET) {
    const room = shares.find(({ stat }) => build[stat] < STAT_MAX);
    if (!room) break;
    build[room.stat] += 1;
    spent += 1;
    // Moved to the back so a second pass spreads rather than piling.
    shares.push(shares.splice(shares.indexOf(room), 1)[0]);
  }

  // Clamping to the floor can push the total past the budget for a very lopsided
  // sheet. Take it back from the largest, which has the most to spare.
  while (spent > STAT_BUDGET) {
    const highest = STATS.reduce((best, stat) => (build[stat] > build[best] ? stat : best), STATS[0]);
    if (build[highest] <= STAT_MIN) break;
    build[highest] -= 1;
    spent -= 1;
  }

  return build;
}

export type ResetOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Which of the two things somebody means by "reset".
 *
 * Named rather than a boolean because the two do almost opposite amounts of
 * damage, and a call site reading `resetCharacter(id, { mode: "REBASELINE" })`
 * cannot be misread the way `resetCharacter(id, build, false)` could.
 */
export type ResetMode = "START_AGAIN" | "RELAY_NUMBERS";

export type ResetPlan = {
  mode: ResetMode;
  /** The spread, checked against the same rule the builder uses. */
  build: StatBlock;
  /**
   * The skills she is built with. `START_AGAIN` only.
   *
   * Every skill row is deleted on that path, and the builder hands out two — so
   * without this a reset adventurer walks away with none where a brand-new one
   * has a pair, and the only way to notice is to go and find the offer on her
   * own sheet. Stamped `chosenAtLevel: 1` exactly as the builder stamps them,
   * or the level-up entitlement would count them as skills she practised into
   * and hand her two extra choices she has already made.
   */
  skills?: string[];
  /**
   * Where to put her level. `RELAY_NUMBERS` only; omit to leave it alone.
   *
   * Floored by what her experience already justifies — see `plannedLevel`.
   */
  level?: number;
  /** Where to put her experience. `RELAY_NUMBERS` only; omit to leave it alone. */
  xp?: number;
};

/**
 * The level a plan will actually write.
 *
 * Never below `levelFor(xp)`, because the stored level is a high-water mark
 * everywhere else in the game: `levelReached` raises it when the curve says so
 * and never lowers it. A sheet set to level 2 on 400 experience would be
 * silently corrected by the next turn anybody played, which is worse than
 * refusing — it looks like the setting did not take.
 *
 * Above that floor an administrator may put it anywhere, including higher than
 * the experience justifies. That is the point of the tool: it exists for the
 * cases the rules cannot work out on their own.
 */
export function plannedLevel(plan: { level?: number; xp?: number }, current: { level: number; xp: number }): number {
  const xp = plan.xp ?? current.xp;
  const asked = plan.level ?? current.level;
  return Math.min(MAX_LEVEL, Math.max(levelFor(xp), Math.max(1, asked)));
}

/**
 * Everything wrong with a plan, or nothing.
 *
 * Separate from `resetCharacter` so a form can ask the same question the
 * database will, and so the rules are testable without a connection.
 */
export function validatePlan(plan: ResetPlan): ResetOutcome {
  const legal = validateStats(plan.build);
  if (!legal.ok) return legal;

  if (plan.mode === "START_AGAIN") {
    const skills = plan.skills ?? [];
    if (skills.length > SKILLS_PER_CHARACTER) {
      return {
        ok: false,
        reason: `Pick at most ${SKILLS_PER_CHARACTER} things she is good at to begin with.`,
      };
    }
    const unknown = skills.find((skill) => !ALL_SKILLS.includes(skill));
    if (unknown) return { ok: false, reason: `${unknown} is not one of the skills.` };
    if (new Set(skills).size !== skills.length) {
      return { ok: false, reason: "The same skill is in the list twice." };
    }
    return { ok: true };
  }

  // Re-laying her numbers. Both fields are optional; each is checked only if it
  // was given, so "change her level and leave the experience" is expressible.
  if (plan.level !== undefined) {
    if (!Number.isInteger(plan.level) || plan.level < 1 || plan.level > MAX_LEVEL) {
      return { ok: false, reason: `A level has to be a whole number between 1 and ${MAX_LEVEL}.` };
    }
  }
  if (plan.xp !== undefined) {
    if (!Number.isInteger(plan.xp) || plan.xp < 0) {
      return { ok: false, reason: "Experience has to be a whole number, and never below nothing." };
    }
  }

  return { ok: true };
}

/**
 * What re-laying her numbers would hand back, so the screen can say so first.
 *
 * The interesting half of that mode and the easy half to miss: writing
 * `buildBudget` back to today's budget means every point her experience has
 * earned is unspent again. She does not lose the growth — she gets to place it
 * somewhere else, which is exactly what "the rules moved underneath her" calls
 * for.
 */
export function pointsHandedBack(xp: number): number {
  return statPointsEarned(xp);
}

/**
 * Puts her back to the day she was built.
 *
 * One transaction, so a reset that fails halfway cannot leave a character with
 * her skills gone and her level still at four — which would be worse than
 * either doing it or not.
 */
export async function resetCharacter(characterId: string, plan: ResetPlan): Promise<ResetOutcome> {
  const legal = validatePlan(plan);
  if (!legal.ok) return legal;

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, level: true, xp: true },
  });
  if (!character) return { ok: false, reason: "That adventurer no longer exists." };

  // Re-laying her numbers touches three columns and nothing else. Written as
  // its own short transaction rather than as a set of conditionals threaded
  // through the destructive one, because the whole value of this mode is that
  // it is obviously safe — and a reader should be able to see that it deletes
  // nothing without holding the other path in their head.
  if (plan.mode === "RELAY_NUMBERS") {
    await db.character.update({
      where: { id: characterId },
      data: {
        ...statColumns(plan.build),
        xp: plan.xp ?? character.xp,
        level: plannedLevel(plan, character),
        // The line that hands her growth back. Measured from today's budget, so
        // `statPointsUnspent` counts every point her experience earned as
        // unspent again — hers to place somewhere else rather than lost.
        buildBudget: STAT_BUDGET,
      },
    });
    return { ok: true };
  }

  await db.$transaction(async (tx) => {
    // Everything earned, in the order it was earned in. `deleteMany` rather
    // than a cascade because the character herself is staying.
    await tx.characterSkill.deleteMany({ where: { characterId } });
    await tx.practice.deleteMany({ where: { characterId } });
    await tx.characterKnack.deleteMany({ where: { characterId } });
    await tx.inventoryItem.deleteMany({ where: { characterId } });
    await tx.keepsake.deleteMany({ where: { characterId } });
    await tx.acquaintance.deleteMany({ where: { characterId } });
    await tx.abilityUse.deleteMany({ where: { characterId } });

    // Bonds are turned down rather than deleted: that these two are sisters was
    // chosen, and only how close they have grown was earned.
    //
    // `bondXp` has to go with `bondLevel`, and for a while it did not. Every
    // display derives the level from the experience — `bondProgress(bondXp)` on
    // the sheet, and `deepen` recomputes `bondLevelFor(bondXp + 1)` on the next
    // kind thing anybody does — so zeroing the column alone reset nothing a
    // player could see and un-reset itself on the following turn.
    //
    // The tie itself is untouched, including whether the other household has
    // agreed to it. Starting an adventurer again is not a reason to ask her
    // sister to confirm they are sisters.
    await tx.relationship.updateMany({
      where: { characterAId: characterId },
      data: { bondLevel: 0, bondXp: 0 },
    });
    await tx.relationship.updateMany({
      where: { characterBId: characterId },
      data: { bondLevel: 0, bondXp: 0 },
    });

    await tx.character.update({
      where: { id: characterId },
      data: {
        xp: 0,
        level: 1,
        ...statColumns(plan.build),
        // Rebuilt under today's rules, so she is measured against them too.
        buildBudget: STAT_BUDGET,
      },
    });

    // The two she begins with, put back. Inside the same transaction as the
    // deletion above, so there is no instant in which an adventurer exists with
    // her old skills gone and her new ones not yet arrived — and stamped at
    // level 1 for the same reason the builder stamps them: left null they read
    // as skills she practised into, and she would be owed two extra choices she
    // has just made.
    for (const name of plan.skills ?? []) {
      await tx.characterSkill.create({ data: { characterId, name, chosenAtLevel: 1 } });
    }
  });

  return { ok: true };
}
