/**
 * Bonds, through the real pipeline.
 *
 * Three claims that only hold end to end, because each spans the whole turn:
 *
 *   1. **A shared plan pays the dice.** The adjudicator reports it, the roll
 *      carries it, and the transcript remembers it — and the row a family reads
 *      tomorrow is the only place all three meet.
 *   2. **A shared plan pays the bond.** The second source these ties have ever
 *      had, and the first that has nothing to do with looking after anybody.
 *   3. **Talking it over pays the bond too, once per scene.** Before this, the
 *      most cooperative thing at the table earned nothing at all — and the cap
 *      is what stops the fix becoming a way to farm bonds by typing "hi".
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/bonds.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn, talkTurn } from "../lib/engine/play.ts";
import { TOGETHER_BONUS } from "../lib/game/together.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5501/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const user = await db.user.create({
    data: {
      email: `bonds-${Date.now()}@example.test`,
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

  // Sisters, so the move names should come out in the sibling flavour.
  const [a, b] = mira.id < rowan.id ? [mira.id, rowan.id] : [rowan.id, mira.id];
  const relationship = await db.relationship.create({
    data: { characterAId: a, characterBId: b, aToB: "SIBLING" },
  });

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "Two of them",
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

  const bondNow = async () =>
    (await db.relationship.findUniqueOrThrow({ where: { id: relationship.id } })).bondXp;

  const before = await bondNow();

  // ---- One plan, two people ------------------------------------------------
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I hum to whatever is in the barley." },
    { characterId: rowan.id, text: "I keep watch while she does it." },
  ]);

  const dice = await db.turnEvent.findFirst({
    where: { type: "DICE_ROLL", scene: { campaignId: campaign.id } },
    orderBy: { ordinal: "desc" },
  });
  const detail = dice?.metadata as unknown as {
    modifier: number;
    roll: number;
    total: number;
    together?: { with: string; bonus: number };
  };

  check("the shared plan reached the dice", detail?.together !== undefined, JSON.stringify(detail?.together));

  check(
    "it is worth what the rules say it is worth",
    detail?.together?.bonus === TOGETHER_BONUS,
    `${detail?.together?.bonus} vs ${TOGETHER_BONUS}`,
  );

  check(
    "she is not listed as working with herself",
    detail?.together?.with === "Rowan",
    `told "${detail?.together?.with}"`,
  );

  check(
    "the bonus is really in the total",
    detail !== undefined && detail.total === detail.roll + detail.modifier + TOGETHER_BONUS,
    `rolled ${detail?.roll} ${detail?.modifier} → ${detail?.total}`,
  );

  const afterPlan = await bondNow();
  check("working together deepened the bond", afterPlan > before, `${before} → ${afterPlan}`);

  // ---- Talking it over -----------------------------------------------------
  await talkTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "What if we go round the back instead?" },
    { characterId: rowan.id, text: "Round the back. Yes. I'll go first." },
  ]);

  const afterTalk = await bondNow();
  check("listening to each other deepened it too", afterTalk > afterPlan, `${afterPlan} → ${afterTalk}`);

  // ---- And the cap ---------------------------------------------------------
  await talkTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "Round the back, then." },
    { characterId: rowan.id, text: "Round the back." },
  ]);

  const afterSecondTalk = await bondNow();
  check(
    "a second conversation in the same scene pays nothing",
    afterSecondTalk === afterTalk,
    `${afterTalk} → ${afterSecondTalk}; without the cap this is how you farm bonds by typing "hi"`,
  );

  const claims = await db.listeningBond.count({ where: { campaignId: campaign.id } });
  check("exactly one listening bond was claimed", claims === 1, `${claims} rows`);

  console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
