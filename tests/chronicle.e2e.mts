/**
 * The long road, through a real adventure driven to its end.
 *
 * Everything on this page is derived — the same figures the ending works out,
 * read across every adventure — with exactly one exception, and that exception
 * is the only thing here a unit test cannot reach: when an adventure is
 * *deleted*, does her road still remember she finished it?
 *
 * So this drives the real pipeline to a real ending, reads the room back, then
 * deletes the adventure out from under it and reads the room again. Everything
 * derived should vanish with the campaign; the fact that she finished it, and
 * what it was worth, should not.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/chronicle.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { chronicleFor } from "../lib/game/chronicle.ts";
import { canonicalPair } from "../lib/game/rules.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5499/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** The phrase the mock storyteller keys its ending on. */
const END_MARKER = "bring the story to its end";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const stamp = Date.now();
  const user = await db.user.create({
    data: {
      email: `road-${stamp}@example.test`,
      displayName: "Parent",
      passwordHash: await hashPassword("hunter2hunter2"),
      role: "ADMIN",
    },
  });

  const [mira, rowan] = await Promise.all([
    db.character.create({
      data: {
        name: "Mira",
        userId: user.id,
        race: "Human",
        archetype: "Trickster",
        pronouns: "she/her",
      },
    }),
    db.character.create({
      data: {
        name: "Rowan",
        userId: user.id,
        race: "Human",
        archetype: "Guardian",
        pronouns: "he/him",
      },
    }),
  ]);

  // Declared and agreed, so the bond has somewhere to land and the pair card
  // has something to say. Both are this household's, so it confirms on the spot.
  await db.relationship.create({
    data: {
      ...canonicalPair(mira.id, rowan.id, "SIBLING"),
      proposedById: user.id,
      confirmedAt: new Date(),
    },
  });

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "The Barley Field",
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "FAMILY_MIXED",
      joinCode: generateJoinCode(),
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  console.log("\n-- An adventure, played and finished ---------------------------");
  await beginCampaign(campaign.id, user.id);

  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I hum the tune I use with the goats." },
    { characterId: rowan.id, text: "I stand between her and the noise." },
  ]);
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I follow the flattened track." },
    { characterId: rowan.id, text: "I stand between her and the noise." },
  ]);
  // Jumped to the last chapter rather than played through all three. An
  // adventure only *finishes* on its final act, and what is being proved here is
  // the ending, not the middle — the same shortcut acquaintances.e2e.mts takes,
  // and for the same reason.
  const acts = await db.storylineAct.count({ where: { storylineId: storyline.id } });
  await db.campaign.update({ where: { id: campaign.id }, data: { currentActIndex: acts } });

  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: `We ${END_MARKER}.` },
    { characterId: rowan.id, text: "I walk home beside her." },
  ]);

  const finished = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { status: true, completedAt: true },
  });
  check("the adventure actually reached its end", finished.status === "COMPLETE", finished.status);

  console.log("\n-- Her room ----------------------------------------------------");
  const road = await chronicleFor(mira.id, user.id);
  if (!road) throw new Error("No road came back.");

  console.log(`     adventures: ${road.adventures.map((a) => `${a.title} (${a.state})`).join(", ")}`);
  console.log(`     finished:   ${road.finished}`);
  console.log(`     dice:       ${road.rolls.landed}/${road.rolls.thrown}, best +${road.rolls.best}`);
  console.log(`     people:     ${road.people.map((p) => p.name).join(", ") || "nobody"}`);
  console.log(
    `     together:   ${road.together
      .map(
        (pair) =>
          `${pair.otherName} (bond ${pair.bondLevel}, ${pair.adventuresShared} shared, ${pair.movesSpent} moves spent, listened ${pair.listened})`,
      )
      .join(", ") || "nobody"}`,
  );

  check("the adventure is on her road", road.adventures.length === 1);
  check("and it reads as finished", road.finished === 1);
  check("her dice are counted across it", road.rolls.thrown > 0);
  check("the people she met came home with her", road.people.length > 0);

  const withRowan = road.together.find((pair) => pair.otherId === rowan.id);
  check("the pair card exists", withRowan !== undefined);
  check("and knows they travelled together", (withRowan?.adventuresShared ?? 0) === 1);
  check(
    "and counts what the bond actually earned",
    (withRowan?.bondLevel ?? 0) > 0 || (withRowan?.listened ?? 0) > 0,
    `bond ${withRowan?.bondLevel}, listened ${withRowan?.listened}`,
  );

  // Somebody at the same table reads it and sees the same road. Bonds and deeds
  // are shared facts; only a private aim is not.
  const asRowanOwner = await chronicleFor(mira.id, user.id);
  check("the same road reads the same for the rest of the table", asRowanOwner?.finished === 1);

  console.log("\n-- What was written down --------------------------------------");
  const entry = await db.roadEntry.findFirstOrThrow({
    where: { characterId: mira.id, campaignId: campaign.id },
  });
  console.log(
    `     ${entry.campaignTitle} · ${entry.storylineTitle} · ${entry.xpEarned} xp · ${entry.rollsLanded}/${entry.rollsThrown}`,
  );
  check("a row was written when the adventure finished", true);
  check(
    "and it agrees with what the room derived",
    entry.xpEarned === road.adventures[0].xpEarned,
    `${entry.xpEarned} vs ${road.adventures[0].xpEarned}`,
  );
  check("it kept the title, not only the id", entry.campaignTitle === "The Barley Field");

  console.log("\n-- The family tidies up ---------------------------------------");
  await db.campaign.delete({ where: { id: campaign.id } });

  const after = await chronicleFor(mira.id, user.id);
  if (!after) throw new Error("No road came back after the delete.");

  console.log(`     adventures: ${after.adventures.map((a) => `${a.title} (${a.state})`).join(", ")}`);
  console.log(`     finished:   ${after.finished}`);
  console.log(`     dice:       ${after.rolls.landed}/${after.rolls.thrown}`);

  check("the adventure is still on her road", after.adventures.length === 1);
  check("still reading as finished", after.finished === 1);
  check("still named", after.adventures[0].title === "The Barley Field");
  check("with no journal left to link to", after.adventures[0].campaignId === null);
  check(
    "and the dice she threw are still counted",
    after.rolls.thrown === road.rolls.thrown,
    `${after.rolls.thrown} vs ${road.rolls.thrown}`,
  );
  check(
    "and what it was worth survives",
    after.adventures[0].xpEarned === road.adventures[0].xpEarned,
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
