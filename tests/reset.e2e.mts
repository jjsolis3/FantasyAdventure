/**
 * The two things people mean by "resetting", against real rows.
 *
 * Only a database can settle these, because the whole point of the safe mode is
 * what it *does not* touch — and "nothing was deleted" is not a claim a pure
 * function can make.
 *
 *   1. **Re-laying her numbers costs nothing.** Skills, knacks, pockets,
 *      keepsakes, the people she knows and how close her bonds have grown all
 *      survive. Only the seven numbers move.
 *   2. **And it hands her growth back.** `buildBudget` is written to today's
 *      budget, so every point her experience earned is unspent again rather
 *      than lost.
 *   3. **The level may be raised, and never quietly lowered below the ladder.**
 *   4. **Starting again really does clear everything** — and, unlike before,
 *      leaves her with the two skills a newly built adventurer has rather than
 *      none at all.
 *   5. **A bond is turned down, not deleted.** The tie is somebody's decision;
 *      only the closeness was earned.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. DATABASE_URL=… npx tsx tests/reset.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { previewReset, resetCharacter, suggestedBuild } from "../lib/game/reset.ts";
import {
  STAT_BUDGET,
  XP_PER_STAT_POINT,
  levelFor,
  statBlock,
  statPointsUnspent,
  statsOf,
} from "../lib/game/rules.ts";
import { hashPassword } from "../lib/auth/password.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5509/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

/** An adventurer with something to lose, and somebody to lose it with. */
async function buildOrin(userId: string, name: string) {
  const orin = await db.character.create({
    data: {
      name,
      userId,
      race: "Elf",
      archetype: "Wondersmith",
      // Deliberately he/him: the screen said "Her numbers" over exactly this.
      pronouns: "he/him",
      // 200 experience buys level 4 on the ladder and five stat points. Stored
      // at level 5, because the stored level is a high-water mark and being
      // above what the experience currently pays for is an ordinary state for a
      // sheet to be in — which is exactly the case worth testing here.
      xp: 200,
      level: 5,
      might: 3,
      wits: 5,
      heart: 3,
      spark: 5,
      grace: 3,
      luck: 4,
      grit: 3,
      skills: {
        create: ["Bargaining", "Small Wonders", "Telling a Joke", "Carrying On Anyway"].map(
          (skill, index) => ({ name: skill, chosenAtLevel: index + 1 }),
        ),
      },
      knacks: { create: [{ key: "quick-fingers", chosenAtLevel: 2 }] },
      inventory: { create: [{ name: "a smooth grey stone" }, { name: "a brass key" }] },
      keepsakes: { create: [{ name: "The owl", note: "opened the door beneath the mill" }] },
      acquaintances: {
        create: [
          {
            key: "beekeeper",
            name: "The Beekeeper",
            about: "Frightened of the hives at first.",
            metInCampaignId: "gone",
            metInCampaignTitle: "The Long Winter",
            timesMet: 2,
          },
        ],
      },
    },
  });
  return orin;
}

async function countsFor(characterId: string) {
  const [skills, knacks, items, keepsakes, acquaintances] = await Promise.all([
    db.characterSkill.count({ where: { characterId } }),
    db.characterKnack.count({ where: { characterId } }),
    db.inventoryItem.count({ where: { characterId } }),
    db.keepsake.count({ where: { characterId } }),
    db.acquaintance.count({ where: { characterId } }),
  ]);
  return { skills, knacks, items, keepsakes, acquaintances };
}

async function main() {
  const stamp = Date.now();
  const user = await db.user.create({
    data: {
      email: `reset-${stamp}@example.test`,
      displayName: "Dad",
      passwordHash: await hashPassword("hunter2hunter2"),
      role: "ADMIN",
    },
  });

  console.log("\n-- The screen knows how to talk about him ------------------------");
  const orin = await buildOrin(user.id, `Orin-${stamp}`);
  const ember = await db.character.create({
    data: { name: `Ember-${stamp}`, userId: user.id, race: "Fox-folk", archetype: "Healer", pronouns: "she/her" },
  });
  const bond = await db.relationship.create({
    data: { characterAId: orin.id, characterBId: ember.id, aToB: "SIBLING", bondLevel: 3, bondXp: 20 },
  });

  const preview = await previewReset(orin.id);
  console.log(`     ${preview?.name}: ${preview?.pronouns}, ${preview?.archetype}, level ${preview?.level}`);
  check("the preview carries his pronouns", preview?.pronouns === "he/him", String(preview?.pronouns));
  check("and his calling, for the skill suggestions", preview?.archetype === "Wondersmith");
  check("and counts what there is to lose", preview?.skills === 4 && preview?.knacks === 1, `${preview?.skills} skills, ${preview?.knacks} knacks`);
  check("including the bond that has grown", preview?.bonds === 1, String(preview?.bonds));

  console.log("\n-- Re-laying his numbers costs him nothing ------------------------");
  const before = await countsFor(orin.id);
  const relaid = statBlock({ might: 2, wits: 4, heart: 2, spark: 4, grace: 2, luck: 3, grit: 2 });

  const outcome = await resetCharacter(orin.id, { mode: "RELAY_NUMBERS", build: relaid });
  check("the plan was legal", outcome.ok, outcome.ok ? "" : outcome.reason);

  const after = await countsFor(orin.id);
  console.log(`     before ${JSON.stringify(before)}\n     after  ${JSON.stringify(after)}`);
  check("every skill is still on the sheet", after.skills === before.skills, `${after.skills} of ${before.skills}`);
  check("and the knack", after.knacks === before.knacks);
  check("and the pockets", after.items === before.items);
  check("and the keepsakes", after.keepsakes === before.keepsakes);
  check("and the people he knows", after.acquaintances === before.acquaintances);

  const stillClose = await db.relationship.findUniqueOrThrow({ where: { id: bond.id } });
  check("and the bond is untouched, not turned down", stillClose.bondLevel === 3 && stillClose.bondXp === 20, `level ${stillClose.bondLevel}`);

  const grown = await db.character.findUniqueOrThrow({ where: { id: orin.id } });
  check("his level is where it was", grown.level === 5, String(grown.level));
  check("and his experience", grown.xp === 200, String(grown.xp));
  check("the numbers are the ones that were typed", statsOf(grown).wits === 4 && statsOf(grown).might === 2, JSON.stringify(statsOf(grown)));

  console.log("\n-- …and hands his growth back ------------------------------------");
  console.log(`     buildBudget ${grown.buildBudget}, xp ${grown.xp}`);
  const unspent = statPointsUnspent(statsOf(grown), grown.xp, grown.buildBudget);
  check("the budget is measured from today's rules", grown.buildBudget === STAT_BUDGET, String(grown.buildBudget));
  check(
    "and every earned point is his to spend again",
    unspent === Math.floor(200 / XP_PER_STAT_POINT),
    `${unspent} unspent`,
  );

  console.log("\n-- The level may be moved, within reason -------------------------");
  await resetCharacter(orin.id, { mode: "RELAY_NUMBERS", build: relaid, level: 7 });
  check("upward, because that is what the tool is for", (await db.character.findUniqueOrThrow({ where: { id: orin.id } })).level === 7);

  // 200 experience pays for level 5, so asking for 2 must land on 5 rather than
  // on a sheet the next turn would silently correct.
  await resetCharacter(orin.id, { mode: "RELAY_NUMBERS", build: relaid, level: 2 });
  const floored = await db.character.findUniqueOrThrow({ where: { id: orin.id } });
  check(
    "never below what the experience already pays for",
    floored.level === levelFor(200),
    `asked 2, got ${floored.level}, ladder says ${levelFor(200)}`,
  );

  const refused = await resetCharacter(orin.id, { mode: "RELAY_NUMBERS", build: relaid, xp: -5 });
  check("and nonsense is refused rather than stored", !refused.ok, refused.ok ? "" : refused.reason);

  console.log("\n-- Starting again clears everything, and leaves him finished -------");
  const suggestion = suggestedBuild(statsOf(floored));
  const again = await resetCharacter(orin.id, {
    mode: "START_AGAIN",
    build: suggestion,
    skills: ["Climbing", "Bargaining"],
  });
  check("the plan was legal", again.ok, again.ok ? "" : again.reason);

  const cleared = await countsFor(orin.id);
  console.log(`     after ${JSON.stringify(cleared)}`);
  check("the knack is gone", cleared.knacks === 0, String(cleared.knacks));
  check("the pockets are empty", cleared.items === 0, String(cleared.items));
  check("the keepsakes are gone", cleared.keepsakes === 0, String(cleared.keepsakes));
  check("and the people he had met", cleared.acquaintances === 0, String(cleared.acquaintances));

  // The bug this whole round started from: he used to walk away with none.
  const startingSkills = await db.characterSkill.findMany({ where: { characterId: orin.id } });
  console.log(`     skills: ${startingSkills.map((s) => `${s.name}@${s.chosenAtLevel}`).join(", ") || "(none)"}`);
  check("he has the two a newly built adventurer has", startingSkills.length === 2, String(startingSkills.length));
  check(
    "stamped as chosen at level 1, not practised into",
    startingSkills.every((skill) => skill.chosenAtLevel === 1),
  );

  const fresh = await db.character.findUniqueOrThrow({ where: { id: orin.id } });
  check("level 1", fresh.level === 1, String(fresh.level));
  check("no experience", fresh.xp === 0, String(fresh.xp));
  check("and no points he has not earned", statPointsUnspent(statsOf(fresh), fresh.xp, fresh.buildBudget) === 0);

  const turnedDown = await db.relationship.findUniqueOrThrow({ where: { id: bond.id } });
  check(
    "the bond is turned down, and the tie itself survives",
    turnedDown.bondLevel === 0 && turnedDown.bondXp === 0 && turnedDown.aToB === "SIBLING",
    `${turnedDown.aToB} at ${turnedDown.bondLevel}`,
  );

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
