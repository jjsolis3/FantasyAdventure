/**
 * A chapter that ends when its work is done.
 *
 * From a real evening: the family finished both of chapter one's objectives —
 * the album and the camera film, both ticked off, the chapter quest marked
 * complete on the summary — and then played six more turns in the same kitchen.
 * Ten turns, one location, "Chapter 1" the whole way. The note afterwards was
 * "no real direction", and it was fair.
 *
 * The cause: advancing the act listened only to the storyteller volunteering
 * `actComplete`, which it never did. Finishing every objective of a chapter did
 * not finish the chapter.
 *
 * This cannot be a unit test. The claim spans the pre-transaction decision (the
 * next chapter's aims need a model call, so it is taken before the turn commits)
 * and the in-transaction one, and the whole point is that those two agree.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/chapters.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { chapterWillBeDone } from "../lib/game/quests.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5499/hearthlight?schema=public";
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
      email: `chapters-${stamp}@example.test`,
      displayName: "Parent",
      passwordHash: await hashPassword("hunter2hunter2"),
      role: "ADMIN",
    },
  });

  const [mira, rowan] = await Promise.all([
    db.character.create({
      data: { name: "Mira", userId: user.id, race: "Human", archetype: "Trickster", pronouns: "she/her" },
    }),
    db.character.create({
      data: { name: "Rowan", userId: user.id, race: "Human", archetype: "Guardian", pronouns: "he/him" },
    }),
  ]);

  const storyline = await db.storyline.findFirstOrThrow({
    where: { minPlayers: { lte: 2 } },
    include: { acts: { orderBy: { index: "asc" } } },
  });

  const campaign = await db.campaign.create({
    data: {
      title: "Every Photograph Is Wrong",
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "SPOOKY",
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

  console.log("\n-- Chapter one opens -------------------------------------------");
  await beginCampaign(campaign.id, user.id);

  const chapterQuest = await db.quest.findFirstOrThrow({
    where: { campaignId: campaign.id, kind: "MAIN", actIndex: 1 },
    include: { objectives: { orderBy: { position: "asc" } } },
  });
  console.log(`     ${chapterQuest.title}`);
  for (const objective of chapterQuest.objectives) console.log(`       - ${objective.text}`);

  const started = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { currentActIndex: true },
  });
  check("the story starts on chapter one", started.currentActIndex === 1);

  check(
    "with work outstanding, the chapter is not over",
    (await chapterWillBeDone(db, {
      campaignId: campaign.id,
      actIndex: 1,
      partyCharacterIds: [mira.id, rowan.id],
      gained: [],
      deedsDone: [],
    })) === false,
  );

  console.log("\n-- The party does the chapter's work ---------------------------");
  // Ticked off directly rather than played out, because what is under test is
  // what happens *after* the last objective lands — not the mock storyteller's
  // ability to produce a particular item on demand.
  for (const objective of chapterQuest.objectives) {
    await db.questObjective.update({
      where: { id: objective.id },
      data: { doneAtTurn: 1, foundByCharacterId: mira.id },
    });
  }

  check(
    "now the chapter's work reads as done",
    (await chapterWillBeDone(db, {
      campaignId: campaign.id,
      actIndex: 1,
      partyCharacterIds: [mira.id, rowan.id],
      gained: [],
      deedsDone: [],
    })) === true,
  );

  console.log("\n-- One ordinary turn ------------------------------------------");
  // The mock storyteller never reports actComplete on an ordinary turn, which
  // is exactly the case that used to hold the family in the kitchen.
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I hum the tune I use with the goats." },
    { characterId: rowan.id, text: "I stand between her and the noise." },
  ]);

  const after = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { currentActIndex: true, status: true },
  });
  console.log(`     chapter is now ${after.currentActIndex} of ${storyline.acts.length}`);
  check(
    "the story moved to chapter two without being told to",
    after.currentActIndex === 2,
    `act ${after.currentActIndex}`,
  );

  const closed = await db.quest.findUniqueOrThrow({ where: { id: chapterQuest.id } });
  check("chapter one's quest closed as finished, not abandoned", closed.status === "COMPLETE");

  const opened = await db.quest.findFirst({
    where: { campaignId: campaign.id, kind: "MAIN", actIndex: 2 },
    include: { objectives: true },
  });
  console.log(`     chapter two asks for: ${opened?.title ?? "nothing"}`);
  check("and chapter two's quest opened", opened !== null);
  check("with something to do in it", (opened?.objectives.length ?? 0) > 0);

  const aims = await db.quest.findMany({
    where: { campaignId: campaign.id, kind: "PERSONAL", actIndex: 2 },
  });
  console.log(`     personal aims for chapter two: ${aims.length}`);
  check(
    "and each of them has an aim of their own again",
    aims.length === 2,
    `${aims.length} opened`,
  );

  console.log("\n-- A chapter with work still outstanding -----------------------");
  const chapterTwo = await db.quest.findFirstOrThrow({
    where: { campaignId: campaign.id, kind: "MAIN", actIndex: 2 },
  });
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I follow the flattened track." },
    { characterId: rowan.id, text: "I keep the lamp high." },
  ]);

  const stillTwo = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { currentActIndex: true },
  });
  check(
    "a chapter whose work is not done does not close by itself",
    stillTwo.currentActIndex === 2,
    `act ${stillTwo.currentActIndex}`,
  );
  const two = await db.quest.findUniqueOrThrow({ where: { id: chapterTwo.id } });
  check("and its quest is still open", two.status === "ACTIVE");

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
