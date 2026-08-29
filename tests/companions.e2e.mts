/**
 * Something small that comes along.
 *
 * ## What a real turn proves
 *
 * That a companion found in the story becomes a real one — carried into the
 * storyteller's context from the next turn onward, counted once a chapter, and
 * on her sheet where a child will look for it.
 *
 * The prompt is inspected directly for the safety line rather than trusted,
 * because a companion is exactly what a storyteller reaches for when it wants
 * stakes without hurting a child's character, and "nothing happens to these" is
 * the one sentence that has to arrive.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. MOCK_COMPANION=1 on the mock storyteller, and the app started.
 *   3. npx tsx tests/companions.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@localhost:5432/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Dad");
  await page.fill('input[name="email"]', "dad@example.test");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);

  await buildCharacter(page, "Mira", "Human", "Beastfriend", { pronouns: "she/her" });
  await buildCharacter(page, "Rowan", "Human", "Guardian", { pronouns: "they/them" });

  const user = await db.user.findFirstOrThrow({ where: { email: "dad@example.test" } });
  const [mira, rowan] = await Promise.all([
    db.character.findFirstOrThrow({ where: { name: "Mira" } }),
    db.character.findFirstOrThrow({ where: { name: "Rowan" } }),
  ]);

  // ---- Nobody starts with one ----------------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  await page.waitForLoadState("networkidle");
  check("an adventurer with nobody is asked if she has somebody",
    (await page.getByRole("button", { name: /They have somebody/ }).count()) > 0);

  // ---- Finding one in the story --------------------------------------------
  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "The wood at the back",
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

  const take = async () =>
    playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "I hum to whatever is in the barley." },
    ]);

  await take();
  const woody = await db.companion.findUnique({ where: { characterId: mira.id } });
  check("something found in the story comes along from now on", woody !== null, woody?.name);
  check("with what it is and what it is good at",
    woody?.kind === "a wooden owl" && woody?.knack === "seeing in the dark",
    `${woody?.kind} / ${woody?.knack}`);
  check("and where it came from", woody?.foundInCampaignTitle === "The wood at the back",
    woody?.foundInCampaignTitle);
  check("nobody else gained one", (await db.companion.count()) === 1);

  // ---- The storyteller is told, and told what it may not do ----------------
  await take();
  const narrations = await db.aiCall.findMany({
    where: { campaignId: campaign.id, stage: "narrate" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const prompt = narrations[0]?.promptPreview ?? "";

  check("the storyteller is told who is travelling with them",
    /Woody, a wooden owl, with Mira/.test(prompt));
  check("and told what they are good at", /seeing in the dark/.test(prompt));
  check("and told plainly that nothing happens to them",
    /NOTHING HAPPENS TO THESE/.test(prompt));
  check("and that they are not there to raise the tension",
    /Do not threaten/.test(prompt));

  // ---- Closeness is chapters, not turns ------------------------------------
  const afterTwo = await db.companion.findUniqueOrThrow({ where: { characterId: mira.id } });
  check("two turns in one chapter is one chapter", afterTwo.closeness === 1,
    `closeness ${afterTwo.closeness}`);

  await take();
  const afterThree = await db.companion.findUniqueOrThrow({ where: { characterId: mira.id } });
  check("and a third turn is still that one chapter", afterThree.closeness === 1,
    `closeness ${afterThree.closeness}`);

  await db.campaign.update({ where: { id: campaign.id }, data: { currentActIndex: 2 } });
  await take();
  const afterChapter = await db.companion.findUniqueOrThrow({ where: { characterId: mira.id } });
  check("the next chapter counts", afterChapter.closeness === 2, `closeness ${afterChapter.closeness}`);

  // ---- On her sheet ---------------------------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  await page.waitForLoadState("networkidle");

  check("her sheet says who comes along", (await page.locator("text=/Woody/").count()) > 0);
  check("and how long it has been going on",
    (await page.locator("text=/2 chapters with them/").count()) > 0);
  check("and where they met", (await page.locator("text=/The wood at the back/").count()) > 0);

  // ---- One at a time --------------------------------------------------------
  await page.getByRole("button", { name: /Change them/ }).click();
  await page.fill('input[name="companionName"]', "Woodrow");
  await page.getByRole("button", { name: /Save them/ }).click();
  await page.locator("text=/Woodrow/").first().waitFor({ timeout: 15_000 });

  const renamed = await db.companion.findUniqueOrThrow({ where: { characterId: mira.id } });
  check("renaming keeps the chapters they have had together", renamed.closeness === 2,
    `closeness ${renamed.closeness}`);
  check("and does not make a second one", (await db.companion.count()) === 1);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
