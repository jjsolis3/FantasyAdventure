/**
 * The game asking them to talk, against a real database.
 *
 * Three claims here that no unit test can reach, and one of them is the reason
 * this file exists at all:
 *
 *   1. `passageCounts` uses a Postgres JSON path filter to find the last thing
 *      anybody *said* rather than tried. That predicate is a property of the
 *      database, not of the code — it either matches `{"spoken": true}` in a
 *      jsonb column or it silently matches nothing and the game goes quiet
 *      forever, which is exactly the failure this whole task is fixing.
 *   2. A conversation's milestones now reach the transcript. They were being
 *      collected and dropped on the floor, so a talk round that unlocked a
 *      Family Move announced nothing at all.
 *   3. A bond that deepens without unlocking anything now says so — the four
 *      times out of five that used to be silent.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/talk.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn, talkTurn } from "../lib/engine/play.ts";
import { passageCounts, talkNudge, turnsSinceTalking } from "../lib/game/talk.ts";
import { neededObjectives } from "../lib/game/briefing.ts";
import { canonicalPair } from "../lib/game/rules.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5505/hearthlight?schema=public";
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
      email: `talk-${stamp}@example.test`,
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

  // Agreed on the spot — both are this household's. A tie nobody has confirmed
  // earns nothing, which is the right rule and would make this test prove
  // nothing at all.
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
      title: "The Quiet Lane",
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "COZY",
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

  console.log("\n-- An opening passage ------------------------------------------");
  await beginCampaign(campaign.id, user.id);

  const scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
    select: { id: true },
  });

  let counts = await passageCounts(scene.id);
  console.log(`     passages ${counts.passages} · since talking ${counts.sinceTalking}`);
  check("one passage on the board", counts.passages === 1, String(counts.passages));
  check("and nobody has said anything yet", counts.sinceTalking === 1);

  const opening = talkNudge({
    encounterName: null,
    soloed: false,
    ...counts,
    clock: { level: 0, limit: 8, owed: false },
  });
  console.log(`     nudge: ${opening?.key} — ${opening?.reason}`);
  check("a new scene asks them to say what they make of it", opening?.key === "opening");

  console.log("\n-- What the board is asking for --------------------------------");
  const needed = await neededObjectives(campaign.id);
  for (const objective of needed) console.log(`     ${objective.kind}  ${objective.text}`);
  check("the chapter's own quest has objectives to show", needed.length > 0, `${needed.length}`);

  // A private aim on the story tab would be the same leak the television is
  // careful about, on the surface everybody at the table can see.
  await db.quest.create({
    data: {
      campaignId: campaign.id,
      title: "Mira's own aim",
      summary: "Something she has not said out loud.",
      secretForCharacterId: mira.id,
      objectives: { create: [{ text: "the tin whistle", kind: "FIND", position: 0 }] },
    },
  });
  const stillNeeded = await neededObjectives(campaign.id);
  check(
    "a private aim never appears among them",
    !stillNeeded.some((objective) => objective.text === "the tin whistle"),
    stillNeeded.map((objective) => objective.text).join(", "),
  );

  console.log("\n-- Two turns of getting on with it -----------------------------");
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I look under the loose board by the door." },
    { characterId: rowan.id, text: "I hold the lamp steady for her." },
  ]);
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I follow the marks along the wall." },
    { characterId: rowan.id, text: "I count the doors as we pass them." },
  ]);

  counts = await passageCounts(scene.id);
  console.log(`     passages ${counts.passages} · since talking ${counts.sinceTalking}`);
  check("passages accumulate", counts.passages === 3, String(counts.passages));
  check(
    "and the quiet is counted from the top of the scene",
    counts.sinceTalking === 3,
    String(counts.sinceTalking),
  );

  console.log("\n-- They talk it over -------------------------------------------");
  const before = await db.relationship.findFirstOrThrow({
    where: { characterAId: { in: [mira.id, rowan.id] } },
    select: { id: true, bondXp: true, bondLevel: true },
  });

  const talked = await talkTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "Rowan, what did you see back there? I could not tell." },
    { characterId: rowan.id, text: "I heard it too. I think we should go together, not apart." },
  ]);
  console.log(`     milestones: ${talked.milestones.join(" | ") || "(none)"}`);

  const after = await db.relationship.findUniqueOrThrow({
    where: { id: before.id },
    select: { bondXp: true, bondLevel: true },
  });
  console.log(`     bond ${before.bondXp} → ${after.bondXp} (level ${after.bondLevel})`);

  // The core of the whole feature. If the JSON predicate does not match, this
  // stays at 3 and the game never asks anybody anything ever again.
  counts = await passageCounts(scene.id);
  console.log(`     passages ${counts.passages} · since talking ${counts.sinceTalking}`);
  check(
    "the conversation resets the quiet counter",
    counts.sinceTalking === 0,
    `since talking ${counts.sinceTalking}`,
  );
  check("and the passage it wrote still counts as a passage", counts.passages === 4);

  // The same answer, from the pure function the play page uses. Two surfaces,
  // two code paths, one number — a television and a phone disagreeing about
  // whether the table has spoken would be worse than neither asking.
  const turns = await db.turnEvent.findMany({
    where: { sceneId: scene.id },
    orderBy: { ordinal: "asc" },
    select: { type: true, metadata: true },
  });
  check(
    "the play page's own count agrees with the television's",
    turnsSinceTalking(turns) === counts.sinceTalking,
    `${turnsSinceTalking(turns)} vs ${counts.sinceTalking}`,
  );

  console.log("\n-- What the conversation was worth -----------------------------");
  const system = await db.turnEvent.findMany({
    where: { sceneId: scene.id, type: "SYSTEM" },
    orderBy: { ordinal: "asc" },
    select: { content: true },
  });
  for (const event of system) console.log(`     ${event.content}`);

  const closer = system.filter((event) => /grew closer/.test(event.content));
  check(
    "a deepened bond reaches the transcript",
    closer.length > 0 || system.some((event) => /can now use/.test(event.content)),
    system.map((event) => event.content).join(" | ") || "(nothing written)",
  );
  check(
    "milestones from a talk round are written down, not dropped",
    talked.milestones.every((milestone) =>
      system.some((event) => event.content === milestone),
    ),
    `${talked.milestones.length} returned, ${system.length} on the transcript`,
  );

  console.log("\n-- A second conversation in the same scene ---------------------");
  // One pair, one scene, once. The ceiling is what stops "hi" eleven times from
  // being the fastest route up the ladder.
  const midway = await db.relationship.findUniqueOrThrow({
    where: { id: before.id },
    select: { bondXp: true },
  });
  await talkTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "Say that again — the bit about the doors." },
    { characterId: rowan.id, text: "There were four, and now there are five." },
  ]);
  const twice = await db.relationship.findUniqueOrThrow({
    where: { id: before.id },
    select: { bondXp: true },
  });
  check(
    "a second conversation in one scene pays nothing more",
    twice.bondXp === midway.bondXp,
    `${midway.bondXp} → ${twice.bondXp}`,
  );

  console.log("\n-- Something standing in front of them -------------------------");
  await db.encounter.create({
    data: {
      campaignId: campaign.id,
      sceneId: scene.id,
      name: "The Hollow Man",
      want: "to be let past",
      kind: "PERSON",
      works: ["a straight answer"],
      backfires: ["shouting"],
      wayOut: "he stands aside",
      nerve: 2,
    },
  });

  const standing = await db.encounter.findFirstOrThrow({
    where: { campaignId: campaign.id, resolvedAt: null },
    select: { name: true, soloCharacterId: true },
  });
  const facing = talkNudge({
    encounterName: standing.name,
    soloed: standing.soloCharacterId != null,
    ...(await passageCounts(scene.id)),
    clock: { level: 0, limit: 8, owed: false },
  });
  console.log(`     nudge: ${facing?.key} — ${facing?.reason}`);
  check("the encounter takes precedence over everything else", facing?.key === "encounter");
  check("and it is named, so the room knows what it is about", /Hollow Man/.test(facing!.reason));

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
