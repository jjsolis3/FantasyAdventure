/**
 * The act clock, through the real pipeline.
 *
 * The claim worth proving here cannot be made by a unit test, because it spans
 * the whole turn: a table going in circles is charged for it, a table getting
 * on with things is not, and the difference is decided from what the pipeline
 * actually extracted rather than from a hand-built object.
 *
 * It also proves the ordering, which is the subtle part. The turn that fills
 * the clock cannot show the consequence — that passage was written before the
 * game had read it — so the fill is a debt and the *next* passage collects.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. MOCK_IDLE=1 npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/pressure.e2e.mts
 *
 * The mock must be restarted without MOCK_IDLE for the second half; this script
 * prints when to do it, or set MOCK_IDLE_PORT and MOCK_BUSY_PORT to run both at
 * once.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { pressureLimit } from "../lib/game/pressure.ts";
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

async function pressureOf(campaignId: string): Promise<number> {
  const row = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { pressure: true },
  });
  return row.pressure;
}

async function main() {
  const user = await db.user.create({
    data: {
      email: `pressure-${Date.now()}@example.test`,
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
      data: { name: "Rowan", userId: user.id, race: "Human", archetype: "Guardian", pronouns: "they/them" },
    }),
  ]);

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });

  // Brisk, because its clock is the shortest and this has to fill one.
  const campaign = await db.campaign.create({
    data: {
      title: "Going in circles",
      joinCode: generateJoinCode(),
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      pacing: "BRISK",
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  const limit = pressureLimit("BRISK");
  console.log(`\n${storyline.pressureName} — ${limit} notches\n`);

  await beginCampaign(campaign.id, user.id);
  check("a fresh adventure opens with a clock at nothing", (await pressureOf(campaign.id)) === 0);

  const idle = process.env.MOCK_IDLE === "1";

  if (!idle) {
    // ---- A table getting on with it -----------------------------------------
    for (let turn = 0; turn < 3; turn += 1) {
      await playTurn(campaign.id, user.id, [
        { characterId: mira.id, text: "I hum to whatever is in the barley." },
      ]);
    }

    const after = await pressureOf(campaign.id);
    check(
      "three turns of getting somewhere cost nothing",
      after === 0,
      `clock at ${after} of ${limit}`,
    );

    console.log("\nNow restart the mock with MOCK_IDLE=1 and run this again.\n");
  } else {
    // ---- A table going in circles -------------------------------------------
    const readings: number[] = [];

    for (let turn = 0; turn < limit + 1; turn += 1) {
      await playTurn(campaign.id, user.id, [
        { characterId: mira.id, text: "I wander about a bit and hum." },
      ]);
      readings.push(await pressureOf(campaign.id));
    }

    console.log(`clock after each idle turn: ${readings.join(" → ")}\n`);

    check(
      "the first wasted turn moves it",
      readings[0] === 1,
      `clock at ${readings[0]} of ${limit}`,
    );

    check(
      "it climbs one notch a turn",
      readings.slice(0, limit).every((value, index) => value === index + 1),
      readings.join(","),
    );

    check(
      "filling it is a debt the next turn pays, and then it resets",
      readings[limit] === 0,
      `after the paying turn the clock reads ${readings[limit]}`,
    );
  }

  console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
