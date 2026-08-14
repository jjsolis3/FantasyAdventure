/**
 * What the table is told, through the real pipeline.
 *
 * The claims here cannot be made by a unit test, because the thing being proved
 * is that four separate stages agree: the storyteller is asked for the things
 * it put within reach, the turn stores them beside the passage that raised
 * them, the play page reads them back, and the television shows them alongside
 * everything the game already knew and had been showing to nobody.
 *
 * It also proves the trimming end to end. The mock deliberately returns one
 * entry written as advice — "You could try the gap in the hedge" — because a 7B
 * model does that however plainly the prompt forbids it, and what a child sees
 * must be a thing, not an instruction.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/briefing.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { knownFacts, neededObjectives, recentRolls, tableFrom } from "../lib/game/briefing.ts";
import { pairScreen, registerScreen, screenView } from "../lib/game/screen.ts";
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
  const user = await db.user.create({
    data: {
      email: `briefing-${Date.now()}@example.test`,
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
        pronouns: "they/them",
      },
    }),
  ]);

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

  console.log("\n-- The opening passage ------------------------------------------");
  await beginCampaign(campaign.id, user.id);

  let scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
    include: { turns: { orderBy: { ordinal: "asc" } } },
  });

  let table = tableFrom(scene.turns);
  console.log(`     question: ${table.whatNow}`);
  console.log(`     in reach: ${JSON.stringify(table.onTheTable)}`);
  check(
    "the opening already puts something within reach",
    table.onTheTable.length === 2,
    `${table.onTheTable.length} things`,
  );
  check(
    "and they are the passage's own nouns",
    table.onTheTable.includes("the lamp Rowan is carrying"),
  );

  console.log("\n-- A turn ------------------------------------------------------");
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I hum the tune I use with the goats." },
    { characterId: rowan.id, text: "I stand between her and the noise." },
  ]);

  scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
    include: { turns: { orderBy: { ordinal: "asc" } } },
  });

  table = tableFrom(scene.turns);
  console.log(`     question: ${table.whatNow}`);
  console.log(`     in reach: ${JSON.stringify(table.onTheTable)}`);

  check(
    "the passage's own nouns reach the table",
    table.onTheTable.includes("the flattened track through the barley"),
  );
  check(
    "advice is trimmed back to the thing it pointed at",
    table.onTheTable.includes("the gap in the hedge"),
    "the model wrote \"You could try the gap in the hedge\"",
  );
  check(
    "and nothing tells a child what to do",
    table.onTheTable.every((thing) => !/^(you|try|maybe|perhaps)\b/i.test(thing)),
  );

  console.log("\n-- What the game already knew ----------------------------------");
  const known = await knownFacts(campaign.id);
  const needed = await neededObjectives(campaign.id);
  const namesById = new Map([
    [mira.id, "Mira"],
    [rowan.id, "Rowan"],
  ]);
  const rolls = await recentRolls(scene.id, namesById);

  console.log(`     known:  ${known.map((fact) => fact.content).join(" / ")}`);
  console.log(`     needed: ${needed.map((objective) => objective.text).join(" / ")}`);
  console.log(
    `     rolls:  ${rolls.map((roll) => `${roll.characterName} ${roll.total}/${roll.target} ${roll.outcome}`).join(" / ")}`,
  );

  check("a fact the party learned is available to show them", known.length > 0);
  check("the chapter's objectives are readable in the players' own words", needed.length > 0);
  check("the roll carries the name of whoever threw it", rolls.length > 0 && rolls[0].characterName !== "Somebody");

  console.log("\n-- The television ----------------------------------------------");
  const registration = await registerScreen();
  const paired = await pairScreen(campaign.id, registration.code, "The living room");
  check("a television can be adopted", paired.ok === true);

  const view = await screenView(campaign.id);
  if (!view) throw new Error("The screen saw nothing.");

  console.log(`     scene:    ${view.scene?.title} — ${view.scene?.location}`);
  console.log(`     question: ${view.whatNow}`);
  console.log(`     in reach: ${JSON.stringify(view.onTheTable)}`);
  console.log(`     needed:   ${view.needed.map((objective) => objective.text).join(" / ")}`);
  console.log(`     known:    ${view.known.map((fact) => fact.content).join(" / ")}`);
  console.log(`     rolls:    ${view.rolls.map((roll) => `${roll.characterName} ${roll.outcome}`).join(" / ")}`);

  check("the wall asks the same question as the phone", view.whatNow === table.whatNow);
  check("the wall shows the same things within reach", JSON.stringify(view.onTheTable) === JSON.stringify(table.onTheTable));
  check("the wall shows what is still needed", view.needed.length > 0);
  check("the wall shows what they know", view.known.length > 0);
  check("the wall shows the dice", view.rolls.length > 0);

  // The version string is what makes a television refetch. If it does not move
  // when the dashboard would look different, the wall goes stale — which is
  // exactly the complaint this work started from.
  const before = view.version;
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I follow the flattened track." },
    { characterId: rowan.id, text: "I keep the lamp high." },
  ]);
  const after = await screenView(campaign.id);
  check("a new turn changes the version, so the wall refetches", before !== after?.version);
  console.log(`     before: ${before}`);
  console.log(`     after:  ${after?.version}`);

  // Personal aims are hers until she says them, on a wall most of all.
  const personal = await db.quest.findFirst({
    where: { campaignId: campaign.id, secretForCharacterId: { not: null }, status: "ACTIVE" },
    include: { objectives: true },
  });
  if (personal) {
    const leaked = after?.needed.some((objective) =>
      personal.objectives.some((secret) => secret.text === objective.text),
    );
    check("a personal aim never reaches the television", leaked !== true, personal.title);
  } else {
    console.log("  ..  no personal quest was open to check against");
  }

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
