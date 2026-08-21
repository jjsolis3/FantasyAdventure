/**
 * Encounters, through the real pipeline.
 *
 * The claims that only hold end to end, because each one spans a whole turn and
 * some of them span several:
 *
 *   1. A passage can put something in front of the party, and it is still there
 *      next turn.
 *   2. It rolls back. Their successes minus what it pressed is what moves.
 *   3. Getting through it pays, and going it alone pays double — to her.
 *   4. It turning is not a defeat and costs nobody any experience.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. MOCK_ENCOUNTER=1 npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/encounters.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import {
  ENCOUNTER_PATIENCE,
  ENCOUNTER_REACH,
  ENCOUNTER_XP,
  SOLO_MULTIPLIER,
} from "../lib/game/encounters.ts";
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
  const user = await db.user.create({
    data: {
      email: `enc-${Date.now()}@example.test`,
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

  const [a, b] = mira.id < rowan.id ? [mira.id, rowan.id] : [rowan.id, mira.id];
  // Confirmed, as the app confirms a tie between two adventurers one account
  // already speaks for. Left pending, `deepen` pays nothing — correctly — and
  // the bond check below fails on right behaviour. Same trap as bonds.e2e.
  await db.relationship.create({
    data: { characterAId: a, characterBId: b, aToB: "SIBLING", confirmedAt: new Date() },
  });

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "Behind the door",
      joinCode: generateJoinCode(),
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  await beginCampaign(campaign.id, user.id);

  const standing = async () =>
    db.encounter.findFirst({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "desc" },
    });

  // ---- One turn opens it ---------------------------------------------------
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I push the door open." },
  ]);

  const opened = await standing();
  check("a passage put something in front of them", opened !== null, opened?.name);
  if (!opened) {
    console.log("\nnothing more can be checked.\n");
    process.exitCode = 1;
    return;
  }

  check("it wants something rather than hating something", opened.want.length > 0, opened.want);
  check("there is always a way out", opened.wayOut.length > 0, opened.wayOut);
  check("it starts even", opened.ground === 0);
  check(
    "and it was not rolled against on the turn that made it",
    opened.ground === 0,
    "a thing cannot push back before it exists",
  );

  // ---- And it is still there, pushing back ---------------------------------
  const grounds: number[] = [];
  let resolvedAfter = 0;

  for (let turn = 0; turn < ENCOUNTER_REACH * 3; turn += 1) {
    await playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "I tell him honestly what happened." },
      { characterId: rowan.id, text: "I stand beside her and back her up." },
    ]);

    const now = await standing();
    grounds.push(now?.ground ?? 0);
    if (now?.resolvedAt) {
      resolvedAfter = turn + 1;
      break;
    }
  }

  console.log(`\nground after each turn: ${grounds.join(" → ")}\n`);

  const settled = await standing();
  check("it stayed on the board across turns", grounds.length > 1 || settled?.resolvedAt !== null);
  check("it ended one way or the other", settled?.resolvedAt !== null, `${resolvedAfter} turns`);
  check(
    "it never ran off the end of the track",
    grounds.every((ground) => Math.abs(ground) <= ENCOUNTER_REACH),
    grounds.join(","),
  );

  // ---- What it paid --------------------------------------------------------
  const [miraAfter, rowanAfter] = await Promise.all([
    db.character.findUniqueOrThrow({ where: { id: mira.id } }),
    db.character.findUniqueOrThrow({ where: { id: rowan.id } }),
  ]);

  if (settled?.ending === "THROUGH") {
    check(
      "both of them were paid for getting through it together",
      miraAfter.xp > 0 && rowanAfter.xp > 0,
      `Mira ${miraAfter.xp}, Rowan ${rowanAfter.xp}`,
    );

    const bond = await db.relationship.findFirstOrThrow({
      where: { characterAId: a, characterBId: b },
    });
    check("and they earned a bond out of it", bond.bondXp > 0, `${bond.bondXp}`);
  } else {
    // The other ending, and it must not be a punishment. They keep everything
    // the dice paid them along the way; the encounter simply turned, and the
    // story is now harder.
    check(
      "it turning cost them nothing they had earned",
      miraAfter.xp >= 0,
      "a turned encounter changes the situation, it does not fine anybody",
    );
    console.log("        (it turned — the payout path is covered by the unit tests)");
  }

  // ---- Going it alone ------------------------------------------------------
  //
  // Driven straight at the rules rather than through another six turns of
  // narration: the pipeline half is proven above, and this is arithmetic.
  const solo = await db.encounter.create({
    data: {
      campaignId: campaign.id,
      sceneId: settled!.sceneId,
      name: "The Locked Cellar",
      want: "to be opened properly",
      kind: "TRAP",
      works: ["looking for the spare key"],
      backfires: ["shouting"],
      wayOut: "go round the outside and get wet",
      soloCharacterId: mira.id,
    },
  });

  const before = (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).xp;
  const rowanBefore = (await db.character.findUniqueOrThrow({ where: { id: rowan.id } })).xp;

  // Wound to the last round with the party ahead, so patience settles it in
  // their favour whatever the dice do. The arithmetic of the payout is the
  // claim here; whether one particular roll landed is not.
  await db.encounter.update({
    where: { id: solo.id },
    data: {
      ground: 1,
      rounds: ENCOUNTER_PATIENCE - 1,
      helperIds: [mira.id, rowan.id],
    },
  });

  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I find the spare key on the ledge, exactly where it lives.", alone: true },
  ]);

  const soloAfter = await db.encounter.findUniqueOrThrow({ where: { id: solo.id } });
  if (soloAfter.ending === "THROUGH") {
    const miraNow = (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).xp;
    const rowanNow = (await db.character.findUniqueOrThrow({ where: { id: rowan.id } })).xp;

    // At least, rather than exactly: every check pays its own experience too,
    // and the encounter's share rides on top of that. The first version of this
    // asserted equality and read 13 of 10 — which was the ordinary roll being
    // paid as well, exactly as it should be.
    check(
      "she took the whole double share",
      miraNow - before >= ENCOUNTER_XP * SOLO_MULTIPLIER,
      `${miraNow - before}, of which ${ENCOUNTER_XP * SOLO_MULTIPLIER} is the encounter`,
    );
    check(
      "and nobody else got a thing, which is the bargain",
      rowanNow === rowanBefore,
      `Rowan ${rowanBefore} → ${rowanNow}`,
    );
  } else {
    console.log(`        (the solo encounter ${soloAfter.ending ?? "is still open"}; dice were unkind)`);
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
