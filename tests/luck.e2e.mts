/**
 * The dice at the table, through the real pipeline.
 *
 * Two claims that unit tests cannot make, because both live in the wiring
 * between a character row and `resolveCheck` rather than in either end:
 *
 *   1. **A Grace check is a real check.** Three of the seven stats had never
 *      been rolled by anything. The party block feeding the pipeline was a
 *      four-key literal behind a cast, so Grace, Luck and Grit arrived as
 *      `undefined`, the modifier came out NaN, and every comparison against NaN
 *      is false — an automatic complication, whatever the girl rolled.
 *   2. **A lucky break survives the round trip.** The lift happens in the dice
 *      and is read back off a JSON column on a transcript row hours later. If
 *      it is not written down, the card at the table shows a total under the
 *      target beside the word Success and no reason for it.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. MOCK_STAT=grace npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/luck.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { STAT_CEILING, luckChance } from "../lib/game/rules.ts";
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

type DiceMetadata = {
  stat: string;
  roll: number;
  modifier: number;
  total: number;
  target: number;
  outcome: string;
  luck?: { from: string; note: string };
};

async function main() {
  const user = await db.user.create({
    data: {
      email: `luck-${Date.now()}@example.test`,
      displayName: "Parent",
      passwordHash: await hashPassword("hunter2hunter2"),
      role: "ADMIN",
    },
  });

  // Grace at the floor and Luck at the ceiling: the check fails most of the
  // time, which is what gives fortune something to do. Written straight to the
  // database because this is about the dice, not about the builder.
  const mira = await db.character.create({
    data: {
      name: "Mira",
      userId: user.id,
      race: "Human",
      archetype: "Trickster",
      pronouns: "she/her",
      might: 3,
      wits: 3,
      heart: 3,
      spark: 3,
      grace: 1,
      luck: STAT_CEILING,
      grit: 3,
    },
  });

  // Every adventure wants two, and the mock only ever calls for a check on
  // Mira — so Rowan is here to make the party legal and nothing else.
  const rowan = await db.character.create({
    data: {
      name: "Rowan",
      userId: user.id,
      race: "Human",
      archetype: "Guardian",
      pronouns: "they/them",
    },
  });

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "A lucky evening",
      joinCode: generateJoinCode(),
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      ownerId: user.id,
      storylineId: storyline.id,
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  await beginCampaign(campaign.id, user.id);

  // Enough turns that a 31% chance per turn is all but certain to land at least
  // once, and few enough that this finishes in under a minute.
  const TURNS = 14;
  const rolled: DiceMetadata[] = [];

  for (let turn = 0; turn < TURNS; turn += 1) {
    await playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "I slip along the wall where the shadow is deepest." },
    ]);

    const events = await db.turnEvent.findMany({
      where: { type: "DICE_ROLL", scene: { campaignId: campaign.id } },
    });
    rolled.length = 0;
    rolled.push(...events.map((event) => event.metadata as unknown as DiceMetadata));

    // Both, or the turns run out. This used to stop at the first lucky break,
    // which puts two checks in tension: one wants a lucky nudge, the other
    // wants a plain success somewhere in the sample. When luck landed on turn
    // one the sample was a single roll, and whether the suite went green came
    // down to that one die.
    const gotLuck = rolled.some((dice) => dice.luck);
    const gotSuccess = rolled.some(
      (dice) => dice.outcome === "SUCCESS" || dice.outcome === "CRITICAL",
    );
    if (gotLuck && gotSuccess) break;
  }

  console.log(`\n${rolled.length} checks rolled, Luck ${STAT_CEILING} → ${luckChance(STAT_CEILING)}%\n`);

  check("every check was a Grace check", rolled.every((dice) => dice.stat === "grace"), `${rolled.length} rolls`);

  check(
    "no roll came out NaN",
    rolled.every((dice) => Number.isFinite(dice.total) && Number.isFinite(dice.modifier)),
    JSON.stringify(rolled.map((dice) => dice.total)),
  );

  check(
    "Grace 1 rolls at −2, not at nothing",
    rolled.every((dice) => dice.modifier === -2),
    JSON.stringify(rolled.map((dice) => dice.modifier)),
  );

  check(
    "a good roll on a Grace check can now succeed",
    rolled.some((dice) => dice.outcome === "SUCCESS" || dice.outcome === "CRITICAL"),
    "before the fix this was impossible short of a natural 20",
  );

  const lucky = rolled.find((dice) => dice.luck);
  check("a lucky break happened and was written down", lucky !== undefined);

  if (lucky) {
    console.log(
      `        rolled ${lucky.roll} ${lucky.modifier} = ${lucky.total} vs ${lucky.target}` +
        ` → was ${lucky.luck?.from}, became ${lucky.outcome}`,
    );
    check(
      "the lift is one step from what it was",
      (lucky.luck?.from === "COMPLICATION" && lucky.outcome === "PARTIAL") ||
        (lucky.luck?.from === "PARTIAL" && lucky.outcome === "SUCCESS"),
      `${lucky.luck?.from} → ${lucky.outcome}`,
    );
    check("the table is told why", (lucky.luck?.note ?? "").includes("Luck was with them"));
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
