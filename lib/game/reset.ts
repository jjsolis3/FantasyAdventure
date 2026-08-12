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
 * **Her four numbers are given, not guessed.** Stats are built once from twelve
 * points and then only ever rise, and nothing in the game can edit them
 * afterwards. That means the engine knows exactly how many points growth added
 * but has no idea *which* stats they went into — and a wrong guess here would
 * be unfixable without deleting her. So the caller supplies the spread, checked
 * against the same rule the builder uses. `suggestedBuild` offers a starting
 * point; a person confirms it.
 */

import { db } from "@/lib/db";
import {
  STATS,
  STAT_BUDGET,
  STAT_MAX,
  STAT_MIN,
  validateStats,
  type StatBlock,
} from "@/lib/game/rules";

/** What a reset would take away, counted before anybody agrees to it. */
export type ResetPreview = {
  characterId: string;
  name: string;
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
      level: true,
      xp: true,
      might: true,
      wits: true,
      heart: true,
      spark: true,
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
    level: character.level,
    xp: character.xp,
    stats: {
      might: character.might,
      wits: character.wits,
      heart: character.heart,
      spark: character.spark,
    },
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
 * Puts her back to the day she was built.
 *
 * One transaction, so a reset that fails halfway cannot leave a character with
 * her skills gone and her level still at four — which would be worse than
 * either doing it or not.
 */
export async function resetCharacter(characterId: string, build: StatBlock): Promise<ResetOutcome> {
  const legal = validateStats(build);
  if (!legal.ok) return { ok: false, reason: legal.reason };

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true },
  });
  if (!character) return { ok: false, reason: "That adventurer no longer exists." };

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
    await tx.relationship.updateMany({
      where: { characterAId: characterId },
      data: { bondLevel: 0 },
    });
    await tx.relationship.updateMany({
      where: { characterBId: characterId },
      data: { bondLevel: 0 },
    });

    await tx.character.update({
      where: { id: characterId },
      data: {
        xp: 0,
        level: 1,
        might: build.might,
        wits: build.wits,
        heart: build.heart,
        spark: build.spark,
      },
    });
  });

  return { ok: true };
}
