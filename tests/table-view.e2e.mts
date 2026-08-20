/**
 * What a family can actually see, and what one girl can see that nobody else can.
 *
 * Five things that only a real database and a real turn can settle:
 *
 *   1. **A private aim is private, and it is loadable.** The whole reason the
 *      briefing filters personal quests out is that the same briefing feeds a
 *      television. So the aim comes down a second, viewer-scoped path — and the
 *      test that matters is the negative one: the other household gets nothing.
 *   2. **The clock keeps its receipts.** A turn that goes nowhere writes a
 *      movement, `clockMoves` reads it back, and the words the party typed are
 *      on it.
 *   3. **…and those receipts stay out of the recap.** Six notches would crowd
 *      out the six things that are still true tomorrow.
 *   4. **The tried list survives a scene ending.** The sixteen-turn chapter, in
 *      miniature: a scene ends when the party moves, and the checklist used to
 *      empty itself exactly then.
 *   5. **Who you know is who you knew before.** Merged across the party, and
 *      never anybody met on this adventure.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. MOCK_IDLE=1 npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/table-view.e2e.mts
 *
 * `MOCK_IDLE=1` plays a table going in circles — nobody rolls, nothing is
 * found, and the storyteller says outright that they got nowhere, which is the
 * exact shape the clock is looking for. It goes on the *server* process, not on
 * this one.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { alreadyTried, neededObjectives, triedNote, yourAims } from "../lib/game/briefing.ts";
import { clockMoves } from "../lib/game/clock-log.ts";
import { knownPeople } from "../lib/game/acquaintances.ts";
import { recapFor } from "../lib/game/recap.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5509/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const stamp = Date.now();

  // Two households, which is the only arrangement that can prove the private
  // half. On one shared screen the parent owns every adventurer and sees
  // everything — correctly — so a single-account test would pass whatever the
  // filter did.
  const [parent, cousin] = await Promise.all([
    db.user.create({
      data: {
        email: `view-a-${stamp}@example.test`,
        displayName: "Parent",
        passwordHash: await hashPassword("hunter2hunter2"),
        role: "ADMIN",
      },
    }),
    db.user.create({
      data: {
        email: `view-b-${stamp}@example.test`,
        displayName: "The other house",
        passwordHash: await hashPassword("hunter2hunter2"),
      },
    }),
  ]);

  const [mira, rowan] = await Promise.all([
    db.character.create({
      data: { name: "Mira", userId: parent.id, race: "Elf", archetype: "Wondersmith", pronouns: "she/her" },
    }),
    db.character.create({
      data: { name: "Rowan", userId: cousin.id, race: "Fox-folk", archetype: "Healer", pronouns: "she/her" },
    }),
  ]);

  const storyline = await db.storyline.findFirstOrThrow({
    where: { slug: "the-village-that-built-itself" },
  });
  const campaign = await db.campaign.create({
    data: {
      title: "The Village That Built Itself",
      ownerId: parent.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      joinCode: generateJoinCode(),
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  console.log("\n-- Somebody you knew before --------------------------------------");
  // An earlier adventure, remembered. Both of them know him; one of them met
  // somebody on *this* adventure, who must not show up.
  const earlier = await db.campaign.create({
    data: {
      title: "The Long Winter",
      ownerId: parent.id,
      storylineId: storyline.id,
      tone: "COZY",
      readingLevel: "MIDDLE_GRADE",
      joinCode: generateJoinCode(),
    },
  });

  for (const characterId of [mira.id, rowan.id]) {
    await db.acquaintance.create({
      data: {
        characterId,
        key: "beekeeper",
        name: "The Beekeeper",
        about: "Frightened of the hives at first, and then not.",
        metInCampaignId: earlier.id,
        metInCampaignTitle: earlier.title,
        timesMet: 2,
      },
    });
  }
  await db.acquaintance.create({
    data: {
      characterId: mira.id,
      key: "stallholder",
      name: "The Stallholder",
      about: "Sold them the wrong rope.",
      metInCampaignId: campaign.id,
      metInCampaignTitle: campaign.title,
      timesMet: 1,
    },
  });

  const people = await knownPeople(db, {
    campaignId: campaign.id,
    party: [
      { characterId: mira.id, name: "Mira" },
      { characterId: rowan.id, name: "Rowan" },
    ],
  });
  console.log(`     ${people.map((p) => `${p.name} (${p.knownBy.join(" & ")})`).join(", ") || "(nobody)"}`);
  check("one person, not two rows", people.length === 1, String(people.length));
  check("and both of them know him", people[0]?.knownBy.length === 2, people[0]?.knownBy.join(" & "));
  check(
    "somebody met on this adventure is not somebody you knew before",
    people.every((person) => person.name !== "The Stallholder"),
  );

  console.log("\n-- Her own aim, and nobody else's --------------------------------");
  await beginCampaign(campaign.id, parent.id);

  const hers = await yourAims(campaign.id, parent.id, 1);
  const theirs = await yourAims(campaign.id, cousin.id, 1);
  const nobody = await yourAims(campaign.id, undefined, 1);

  for (const aim of hers) {
    console.log(`     ${aim.characterName}: ${aim.title}`);
    for (const objective of aim.objectives) console.log(`       ${objective.kind}  ${objective.text}`);
  }

  check("the parent's browser gets her adventurer's aim", hers.length === 1, String(hers.length));
  check("and it is Mira's", hers[0]?.characterName === "Mira", hers[0]?.characterName);
  check("the other household gets its own", theirs.length === 1 && theirs[0]?.characterName === "Rowan");
  check(
    "and never the other one's",
    hers.every((aim) => aim.characterName !== "Rowan") &&
      theirs.every((aim) => aim.characterName !== "Mira"),
  );
  check("a caller who forgot to say who is asking sees nothing", nobody.length === 0);
  check("every aim has something to actually do", hers[0]?.objectives.length > 0);

  // The boundary that makes all of the above necessary: the shared briefing —
  // which is what the television is built from — must not contain any of it.
  const shared = await neededObjectives(campaign.id, 10, 1);
  const aimText = new Set(hers.concat(theirs).flatMap((aim) => aim.objectives.map((o) => o.text)));
  check(
    "and none of it is on the shared board the television reads",
    shared.every((objective) => !aimText.has(objective.text)),
    shared.map((o) => o.text).join(" | "),
  );

  console.log("\n-- A turn that went nowhere --------------------------------------");
  await playTurn(campaign.id, parent.id, [
    { characterId: mira.id, text: "I look around the room again." },
    { characterId: rowan.id, text: "I wait by the door." },
  ]);

  const moves = await clockMoves(campaign.id, 1);
  for (const move of moves) {
    console.log(`     turn ${move.turn} · ${move.level} of ${move.limit} · ${move.tried.join(" | ")}`);
  }
  check("the clock kept a receipt", moves.length === 1, String(moves.length));
  check("with the turn on it", moves[0]?.turn === 1, String(moves[0]?.turn));
  check("and where it left the clock", moves[0]?.level === 1, String(moves[0]?.level));
  check(
    "and what they actually typed",
    moves[0]?.tried.includes("I look around the room again."),
    moves[0]?.tried.join(" | "),
  );
  check("it is not a debt yet", moves[0]?.spent === false);

  const clock = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { pressure: true },
  });
  check("and the clock itself agrees", clock.pressure === 1, String(clock.pressure));

  console.log("\n-- …but the recap is still about what changed --------------------");
  const scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
    select: { id: true, title: true },
  });
  // An idle turn writes no milestones at all, so without something real beside
  // the notch this would pass by having nothing to filter — which is a test
  // that proves nothing. One ordinary milestone, of the kind the engine writes
  // every time somebody finds something, makes the assertion mean what it says.
  await db.turnEvent.create({
    data: {
      sceneId: scene.id,
      ordinal: 900,
      type: "SYSTEM",
      content: "Mira is now carrying the brass key.",
    },
  });

  const systemRows = await db.turnEvent.count({ where: { sceneId: scene.id, type: "SYSTEM" } });
  const recap = await recapFor({ id: scene.id, title: scene.title, summary: null });
  console.log(`     ${systemRows} system rows → ledger: ${recap.changed.join(" | ") || "(nothing)"}`);

  check("the notch and the milestone share a table", systemRows === 2, String(systemRows));
  check(
    "and only the milestone reaches the ledger",
    recap.changed.length === 1 && recap.changed[0] === "Mira is now carrying the brass key.",
    recap.changed.join(" | "),
  );
  check(
    "no clock notch got into it",
    recap.changed.every((line) => !/went nowhere|ran out/.test(line)),
    recap.changed.join(" | "),
  );

  console.log("\n-- What they tried, across a scene ending -------------------------");
  // A second scene in the same chapter, as if the party had moved on. This is
  // the exact shape that used to empty the checklist.
  const next = await db.scene.create({
    data: {
      campaignId: campaign.id,
      index: 99,
      actIndex: 1,
      title: "The Stairs",
      status: "OPEN",
    },
  });
  await db.turnEvent.create({
    data: {
      sceneId: next.id,
      ordinal: 0,
      type: "PLAYER_ACTION",
      actorCharacterId: mira.id,
      content: "I climb the stairs.",
    },
  });

  const attempts = await db.turnEvent.findMany({
    where: { type: "PLAYER_ACTION", scene: { campaignId: campaign.id, actIndex: 1 } },
    orderBy: [{ createdAt: "asc" }, { ordinal: "asc" }],
    select: { type: true, content: true, metadata: true, sceneId: true },
  });
  const tried = alreadyTried(attempts, next.id);
  for (const attempt of tried) {
    console.log(`     ${attempt.thisScene ? "here " : "back "} ${attempt.text}`);
  }

  check("the earlier scene's attempts are still on the list", tried.length >= 3, String(tried.length));
  check("the newest is the one just typed", tried[0]?.text === "I climb the stairs.", tried[0]?.text);
  check("and it is marked as being in this room", tried[0]?.thisScene === true);
  check(
    "while the one from the last room says so",
    tried.some((attempt) => attempt.text === "I wait by the door." && !attempt.thisScene),
  );

  const note = triedNote(tried);
  check("and the storyteller is handed the same list", /- I climb the stairs\./.test(note));
  check("with the instruction that matters", /do not quietly make one work now/.test(note));

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
