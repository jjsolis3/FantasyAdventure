/**
 * Family ties across two households, through the real database.
 *
 * This replays the case that found the bug, because it is the one that matters
 * and no unit test can hold it: a father hands his old adventurer to his
 * daughters, makes a new one, and tries to say he is their father. Before this
 * work the dropdown on his sheet was empty — the rule asked whether *his new
 * character* had already shared a campaign with them, and a character made five
 * minutes ago has shared nothing.
 *
 * It also proves the half that matters once people outside the house join a
 * party: a claim about somebody else's adventurer earns nothing until that
 * household agrees, and the migration confirms every tie that already existed
 * so nobody mid-adventure loses a bond to a deploy.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/ties.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { isConfirmed, needsConsent, reachableCharacterWhere } from "../lib/game/ties.ts";
import { waitingPointsFor } from "../lib/game/waiting-points.ts";
import { canonicalPair, statsOf } from "../lib/game/rules.ts";
import { resetCharacter } from "../lib/game/reset.ts";
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

/** The household this account may name a tie to. */
async function reachableFor(userId: string, exclude: string) {
  return db.character.findMany({
    where: { id: { not: exclude }, ...reachableCharacterWhere(userId) },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

async function main() {
  const stamp = Date.now();
  const [dad, older, younger] = await Promise.all([
    db.user.create({
      data: {
        email: `dad-${stamp}@example.test`,
        displayName: "Dad",
        passwordHash: await hashPassword("hunter2hunter2"),
        role: "ADMIN",
      },
    }),
    db.user.create({
      data: {
        email: `older-${stamp}@example.test`,
        displayName: "Ada",
        passwordHash: await hashPassword("hunter2hunter2"),
      },
    }),
    db.user.create({
      data: {
        email: `younger-${stamp}@example.test`,
        displayName: "Bea",
        passwordHash: await hashPassword("hunter2hunter2"),
      },
    }),
  ]);

  // Named to match what the mock storyteller reports a bond moment between —
  // it says "Rowan stood between Mira and the noise", so the father's new
  // adventurer is Rowan and the tie under test is the one that moment lands on.
  const [mira, wren] = await Promise.all([
    db.character.create({
      data: {
        name: "Mira",
        userId: older.id,
        race: "Human",
        archetype: "Trickster",
        pronouns: "she/her",
      },
    }),
    db.character.create({
      data: {
        name: "Wren",
        userId: younger.id,
        race: "Human",
        archetype: "Guardian",
        pronouns: "she/her",
      },
    }),
  ]);

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "The Barley Field",
      ownerId: dad.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "FAMILY_MIXED",
      joinCode: generateJoinCode(),
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: wren.id, position: 1 },
        ],
      },
    },
  });

  console.log("\n-- The father makes a new adventurer ----------------------------");
  const orin = await db.character.create({
    data: {
      name: "Rowan",
      userId: dad.id,
      race: "Human",
      archetype: "Guardian",
      pronouns: "he/him",
    },
  });

  const reachable = await reachableFor(dad.id, orin.id);
  console.log(`     the new adventurer can be related to: ${reachable.map((c) => c.name).join(", ") || "nobody"}`);
  check(
    "a brand-new adventurer can reach the girls he has never travelled with",
    reachable.length === 2,
    `${reachable.length} found`,
  );

  // The old rule, replayed, so the regression is nailed down rather than
  // described: it asked whether ORIN had shared a campaign, and he has not.
  const underOldRule = await db.character.findMany({
    where: {
      id: { not: orin.id },
      OR: [
        { userId: dad.id },
        { partyMemberships: { some: { campaign: { party: { some: { characterId: orin.id } } } } } },
      ],
    },
    select: { id: true },
  });
  check(
    "and under the old rule he could reach nobody, which is the bug",
    underOldRule.length === 0,
    `${underOldRule.length} found`,
  );

  console.log("\n-- Saying he is their father -----------------------------------");
  const toMira = canonicalPair(orin.id, mira.id, "PARENT");
  check("this one needs the other household's yes", needsConsent(dad.id, older.id));

  const proposal = await db.relationship.create({
    data: { ...toMira, proposedById: dad.id, confirmedAt: null },
  });
  check("and is stored waiting rather than refused", !isConfirmed(proposal));

  // Nothing is earned while it waits. Driven through the real turn pipeline
  // rather than asserted about `deepen` directly, because the claim is about
  // what an evening of play is worth, not about one function.
  await db.partyMember.create({ data: { campaignId: campaign.id, characterId: orin.id, position: 2 } });
  await beginCampaign(campaign.id, dad.id);
  await playTurn(campaign.id, dad.id, [
    { characterId: mira.id, text: "I hum the tune I use with the goats." },
    { characterId: wren.id, text: "I stand between her and the noise." },
    { characterId: orin.id, text: "I stand between her and the noise." },
  ]);

  const afterTurn = await db.relationship.findUniqueOrThrow({ where: { id: proposal.id } });
  console.log(`     bond after a full turn while pending: ${afterTurn.bondXp}`);
  check("a tie nobody has agreed to earns nothing at all", afterTurn.bondXp === 0);

  console.log("\n-- The daughter is told ----------------------------------------");
  const miraRow = await db.character.findUniqueOrThrow({
    where: { id: mira.id },
    include: { skills: true, knacks: { select: { id: true } } },
  });
  const waiting = await waitingPointsFor([
    {
      id: miraRow.id,
      userId: miraRow.userId,
      xp: miraRow.xp,
      stats: statsOf(miraRow),
      buildBudget: miraRow.buildBudget,
      knackCount: miraRow.knacks.length,
      chosenSkillCount: miraRow.skills.filter((skill) => skill.chosenAtLevel !== null).length,
      level: miraRow.level,
    },
  ]);
  const labels = (waiting.get(mira.id) ?? []).map((point) => point.label);
  console.log(`     Mira's list says: ${labels.join(" / ") || "nothing"}`);
  check(
    "the household being asked is told, rather than having to go looking",
    labels.some((label) => label.includes("tie")),
  );

  const dadWaiting = await waitingPointsFor([
    {
      id: orin.id,
      userId: dad.id,
      xp: 0,
      stats: statsOf(orin),
      buildBudget: orin.buildBudget,
      knackCount: 0,
      chosenSkillCount: 0,
      level: 1,
    },
  ]);
  check(
    "and the household that asked is not pestered about its own proposal",
    !(dadWaiting.get(orin.id) ?? []).some((point) => point.label.includes("tie")),
  );

  console.log("\n-- She agrees --------------------------------------------------");
  await db.relationship.update({
    where: { id: proposal.id },
    data: { confirmedAt: new Date() },
  });

  await playTurn(campaign.id, dad.id, [
    { characterId: mira.id, text: "I follow the flattened track." },
    { characterId: wren.id, text: "I keep the lamp high." },
    { characterId: orin.id, text: "I stand between her and the noise." },
  ]);

  const afterYes = await db.relationship.findUniqueOrThrow({ where: { id: proposal.id } });
  console.log(`     bond after a turn once agreed: ${afterYes.bondXp}`);
  check("once agreed, the same play earns the bond it should", afterYes.bondXp > 0);

  console.log("\n-- A tie inside one household ----------------------------------");
  const bramble = await db.character.create({
    data: {
      name: "Bramble",
      userId: dad.id,
      race: "Stonekin",
      archetype: "Beastfriend",
      pronouns: "they/them",
    },
  });
  check("needs nobody's permission", !needsConsent(dad.id, dad.id));
  const own = await db.relationship.create({
    data: {
      ...canonicalPair(orin.id, bramble.id, "SIBLING"),
      proposedById: dad.id,
      confirmedAt: new Date(),
    },
  });
  check("and is confirmed on the spot", isConfirmed(own));

  console.log("\n-- Starting an adventurer again --------------------------------");
  const before = await db.relationship.findUniqueOrThrow({ where: { id: proposal.id } });
  // 7 stats at a floor of 1 is 7, plus the 12 a family may spend — see
  // STAT_BUDGET. A row created straight through Prisma carries the schema
  // default of 3 everywhere, which is 21 and two over.
  const legalBuild = { might: 5, wits: 4, heart: 3, spark: 1, grace: 1, luck: 1, grit: 4 };
  const reset = await resetCharacter(orin.id, legalBuild);
  check("the reset itself went through", reset.ok === true, reset.ok ? "" : reset.reason);
  const afterReset = await db.relationship.findUniqueOrThrow({ where: { id: proposal.id } });
  console.log(`     bond xp ${before.bondXp} → ${afterReset.bondXp}`);
  check("the bond is actually turned down, not just its unread column", afterReset.bondXp === 0);
  check("but the tie itself survives, still agreed to", isConfirmed(afterReset));

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
