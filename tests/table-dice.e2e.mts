/**
 * The table's own dice, through the real pipeline.
 *
 * The claim is the whole feature and it only holds end to end: a turn stops
 * halfway, nothing is written down while it waits, the numbers the family typed
 * are the numbers on the transcript, and the rest of the turn happens exactly as
 * it always did.
 *
 * The middle one matters most. A turn that stopped has not happened — so a table
 * that puts their phones down and goes to bed loses one model call, not an
 * evening.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/table-dice.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { awaitedRolls, beginCampaign, playTurn, submitRolls } from "../lib/engine/play.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5503/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

/** The number the girls are going to claim they rolled. */
const ROLLED = 17;

async function main() {
  const user = await db.user.create({
    data: {
      email: `dice-${Date.now()}@example.test`,
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
  const campaign = await db.campaign.create({
    data: {
      title: "Dice on the table",
      joinCode: generateJoinCode(),
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      diceMode: "TABLE",
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  await beginCampaign(campaign.id, user.id);

  const turnsBefore = await db.turnEvent.count({ where: { scene: { campaignId: campaign.id } } });
  const xpBefore = (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).xp;

  // ---- The turn stops ------------------------------------------------------
  const stopped = await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I hum to whatever is in the barley." },
  ]);

  // The value, not the key. `"awaiting" in stopped` is true even when the
  // property is there and undefined, so this neither narrowed the type nor
  // actually asserted that any dice were asked for.
  const awaiting = stopped.awaiting ?? [];
  check("the turn stopped and asked", awaiting.length > 0, `${awaiting.length} asked for`);
  if (awaiting.length === 0) {
    console.log("\nnothing more can be checked.\n");
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nasked for: ${awaiting.map((roll) => `${roll.characterName} (${roll.stat})`).join(", ")}\n`,
  );

  check("it named who is rolling and what for", awaiting[0].characterName === "Mira");
  check("and what she is trying to do", awaiting[0].intent.length > 0, awaiting[0].intent);

  // ---- And nothing happened while it waited --------------------------------
  const turnsWhileWaiting = await db.turnEvent.count({ where: { scene: { campaignId: campaign.id } } });
  const xpWhileWaiting = (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).xp;

  check(
    "nothing was written down while the dice were in the air",
    turnsWhileWaiting === turnsBefore && xpWhileWaiting === xpBefore,
    `${turnsBefore} turns and ${xpBefore} xp, unchanged`,
  );

  // ---- A second phone sees the same question -------------------------------
  const seenElsewhere = await awaitedRolls(campaign.id, user.id);
  check(
    "a phone that reloads sees the same ask",
    seenElsewhere.length === awaiting.length,
    `${seenElsewhere.length} of ${awaiting.length}`,
  );

  // ---- A number that is not on a d20 ---------------------------------------
  let refused = "";
  await submitRolls(campaign.id, user.id, [{ index: 0, value: 40 }]).catch((error: Error) => {
    refused = error.message;
  });
  check("a number that is not on a d20 is refused", refused.length > 0, refused);
  check(
    "and the ask survives being refused",
    (await awaitedRolls(campaign.id, user.id)).length > 0,
    "a fat-fingered 40 must not cost the table its turn",
  );

  // ---- What they actually rolled -------------------------------------------
  const finished = await submitRolls(campaign.id, user.id, [{ index: 0, value: ROLLED }]);
  check("the turn finished", !("awaiting" in finished));
  if ("awaiting" in finished) {
    console.log("\nstill waiting; nothing more can be checked.\n");
    process.exitCode = 1;
    return;
  }

  const dice = await db.turnEvent.findFirst({
    where: { type: "DICE_ROLL", scene: { campaignId: campaign.id } },
    orderBy: { ordinal: "desc" },
  });
  const detail = dice?.metadata as unknown as {
    roll: number;
    modifier: number;
    skillBonus?: number;
    total: number;
    together?: { bonus: number };
  };

  check(
    "the number on the transcript is the number they rolled",
    detail?.roll === ROLLED,
    `typed ${ROLLED}, recorded ${detail?.roll}`,
  );

  // The point of the whole division of labour: she throws the die, the app adds
  // everything up. This first read 17 + 0 = 17 and came out at 18, which was
  // the assertion being wrong rather than the code — the shared plan was worth
  // a point, exactly as it should be. Kept as the full sum, because a hand-typed
  // number going through every modifier is the claim worth protecting.
  const expected =
    (detail?.roll ?? 0) +
    (detail?.modifier ?? 0) +
    (detail?.skillBonus ?? 0) +
    (detail?.together?.bonus ?? 0);

  check(
    "the app still did the adding up, shared plan and all",
    detail !== undefined && detail.total === expected,
    `${detail?.roll} + ${detail?.modifier} modifier + ${detail?.together?.bonus ?? 0} together = ${detail?.total}`,
  );

  check("the story carried on", finished.narration.length > 0);

  check(
    "and the ask is put away",
    (await awaitedRolls(campaign.id, user.id)).length === 0,
  );

  // ---- Sending twice -------------------------------------------------------
  let second = "";
  await submitRolls(campaign.id, user.id, [{ index: 0, value: 20 }]).catch((error: Error) => {
    second = error.message;
  });
  check(
    "a second phone pressing send is told it is already done",
    second.length > 0,
    second,
  );

  console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
