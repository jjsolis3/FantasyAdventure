/**
 * The evening that got stuck in chapter one, and the ladder that was too short.
 *
 * Four things only a real database and a real turn can settle:
 *
 *   1. **The objective nobody could tick now ticks.** Chapter one of *The
 *      Village That Built Itself* asks for "the first thing you made, awake now
 *      and following you about" — a wooden owl on a child's shoulder, never an
 *      `InventoryItem`. The pockets could not answer it and the chapter could
 *      not close. This drives a real turn where the storyteller says it
 *      happened, and watches the chapter move on.
 *   2. **Nobody loses a level.** The curve got four times steeper. An adventurer
 *      already at level 4 on the old ladder must still be level 4 after a turn
 *      on the new one — the number on the front of her sheet is the one she
 *      cares about.
 *   3. **Nobody loses a skill.** Four chosen skills at level 4 is over the new
 *      entitlement of three. She keeps all four and simply waits.
 *   4. **The pockets stop keeping two of the same pastry.**
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. MOCK_TICK=1 npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/rebalance.e2e.mts
 *
 * `MOCK_TICK=1` makes the mock storyteller report that the first outstanding
 * objective happened — which is the whole point here, and which the real
 * storyteller could not do at all until this round. It goes on the *server*
 * process, not on this one.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn, markStoppingPoint } from "../lib/engine/play.ts";
import { levelFor, levelReached, statPointsUnspent, statsOf } from "../lib/game/rules.ts";
import { skillPicksUnspent } from "../lib/game/skill-offer.ts";
import { neededObjectives } from "../lib/game/briefing.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5507/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const stamp = Date.now();
  const user = await db.user.create({
    data: {
      email: `bal-${stamp}@example.test`,
      displayName: "Parent",
      passwordHash: await hashPassword("hunter2hunter2"),
      role: "ADMIN",
    },
  });

  console.log("\n-- Two adventurers, exactly as the journal left them -------------");
  // Orin and Ember from the real evening, standing in as Mira and Rowan because
  // that is who the mock storyteller narrates. Level 4 on 45 experience with
  // four chosen skills: on the new ladder 45 is level 2 and four skills is one
  // over the entitlement, so this pair is the whole test of "nothing is taken
  // away".
  const [orin, ember] = await Promise.all([
    db.character.create({
      data: {
        name: "Mira",
        userId: user.id,
        race: "Elf",
        archetype: "Wondersmith",
        pronouns: "he/him",
        xp: 45,
        level: 4,
        wits: 4,
        spark: 4,
        luck: 4,
        skills: {
          create: ["Bargaining", "Carrying On Anyway", "Small Wonders", "Telling a Joke"].map(
            (name, index) => ({ name, chosenAtLevel: index + 1 }),
          ),
        },
      },
    }),
    db.character.create({
      data: {
        name: "Rowan",
        userId: user.id,
        race: "Fox-folk",
        archetype: "Healer",
        pronouns: "she/her",
        xp: 45,
        level: 4,
        spark: 6,
        luck: 4,
        wits: 2,
        grit: 2,
      },
    }),
  ]);

  console.log(`     Orin: level ${orin.level}, ${orin.xp} xp, ${(await db.characterSkill.count({ where: { characterId: orin.id } }))} skills`);
  check("the new ladder alone would demote him", levelFor(orin.xp) === 2, `levelFor(45) = ${levelFor(orin.xp)}`);
  check("but the high-water mark keeps him where he was", levelReached(orin.xp, orin.level) === 4);
  check(
    "and he keeps every skill, with nothing waiting",
    skillPicksUnspent({ level: 4, chosen: 4 }) === 0,
  );

  const storyline = await db.storyline.findFirstOrThrow({ where: { slug: "the-village-that-built-itself" } });
  const campaign = await db.campaign.create({
    data: {
      title: "The Village That Built Itself",
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      joinCode: generateJoinCode(),
      party: {
        create: [
          { characterId: orin.id, position: 0 },
          { characterId: ember.id, position: 1 },
        ],
      },
    },
  });

  console.log("\n-- The chapter that could not be finished ------------------------");
  await beginCampaign(campaign.id, user.id);

  const chapter = await db.quest.findFirstOrThrow({
    where: { campaignId: campaign.id, kind: "MAIN", actIndex: 1 },
    include: { objectives: true },
  });
  for (const objective of chapter.objectives) {
    console.log(`     ${objective.kind}  ${objective.text}`);
  }
  check(
    "the chapter still asks for the thing that follows them about",
    chapter.objectives.some((objective) => /following you about/.test(objective.text)),
  );
  check(
    "and it is a FIND, so pockets alone would never answer it",
    chapter.objectives.every((objective) => objective.kind === "FIND"),
  );

  await playTurn(campaign.id, user.id, [
    { characterId: orin.id, text: "I climb the stairs to see who is building them." },
    { characterId: ember.id, text: "I follow him up, nervously." },
  ]);

  const after = await db.quest.findFirstOrThrow({
    where: { id: chapter.id },
    include: { objectives: true },
  });
  const ticked = after.objectives.filter((objective) => objective.doneAtTurn !== null);
  console.log(`     ticked: ${ticked.map((o) => o.text).join(" | ") || "(none)"}`);
  check(
    "the storyteller can now tick it off",
    ticked.length === chapter.objectives.length,
    `${ticked.length} of ${chapter.objectives.length}`,
  );

  const moved = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { currentActIndex: true, turnCounter: true },
  });
  console.log(`     chapter ${moved.currentActIndex} after ${moved.turnCounter} turn(s)`);
  check("and the story moves on rather than circling", moved.currentActIndex === 2);

  console.log("\n-- Nothing was taken away ---------------------------------------");
  const grownOrin = await db.character.findUniqueOrThrow({ where: { id: orin.id } });
  console.log(`     Orin: level ${grownOrin.level}, ${grownOrin.xp} xp`);
  check("he is still level 4 after a real turn", grownOrin.level >= 4, String(grownOrin.level));
  check("and he earned experience for it", grownOrin.xp > 45, String(grownOrin.xp));
  check(
    "his skills are all still on the sheet",
    (await db.characterSkill.count({ where: { characterId: orin.id } })) === 4,
  );
  check(
    "and he is not shown points he has not earned",
    statPointsUnspent(statsOf(grownOrin), grownOrin.xp, grownOrin.buildBudget) === 0,
    `unspent ${statPointsUnspent(statsOf(grownOrin), grownOrin.xp, grownOrin.buildBudget)}`,
  );

  console.log("\n-- Two of the same pastry ---------------------------------------");
  const pockets = await db.inventoryItem.findMany({
    where: { characterId: { in: [orin.id, ember.id] } },
    select: { name: true, quantity: true },
  });
  console.log(`     ${pockets.map((item) => `${item.name} ×${item.quantity}`).join(", ") || "(empty)"}`);
  // The mock hands out the same stone every turn, so a second turn is what
  // proves the merge rather than a duplicate row.
  await playTurn(campaign.id, user.id, [
    { characterId: orin.id, text: "I look into the moss-lined chamber." },
    { characterId: ember.id, text: "I crochet a tiny coat for the owl." },
  ]);
  const twice = await db.inventoryItem.findMany({
    where: { characterId: { in: [orin.id, ember.id] } },
    select: { name: true, quantity: true },
  });
  console.log(`     ${twice.map((item) => `${item.name} ×${item.quantity}`).join(", ")}`);
  check(
    "the same thing found twice is one row with a count",
    twice.filter((item) => /stone/.test(item.name)).length === 1,
    twice.map((item) => item.name).join(", "),
  );

  console.log("\n-- Stopping here, once ------------------------------------------");
  await markStoppingPoint(campaign.id, user.id);
  await markStoppingPoint(campaign.id, user.id);
  await markStoppingPoint(campaign.id, user.id);

  const scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
    select: { id: true },
  });
  const bookmarks = await db.turnEvent.count({
    where: { sceneId: scene.id, type: "SYSTEM", content: { contains: "stopped here" } },
  });
  console.log(`     bookmarks written: ${bookmarks}`);
  check("three presses leave one bookmark", bookmarks === 1, String(bookmarks));

  console.log("\n-- Being stuck is noticed ---------------------------------------");
  // Wind the clock forward past the threshold without touching the objectives.
  await db.campaign.update({ where: { id: campaign.id }, data: { turnCounter: 40 } });
  const needed = await neededObjectives(campaign.id, 5, 40);
  for (const objective of needed) {
    console.log(`     ${objective.text} — stuck for ${objective.stuckFor ?? "no"} turns`);
  }
  check("an objective nobody has moved says so", needed.some((o) => o.stuckFor !== null));

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
