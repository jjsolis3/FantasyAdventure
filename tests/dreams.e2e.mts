/**
 * The one thing an adventurer wants that no single adventure can give her.
 *
 * ## What only a real turn can prove
 *
 * The unit tests hold the cooldown arithmetic and the shape of the contract.
 * What they cannot show is the thing the whole feature rests on: that a
 * storyteller which *tries* to mention a wish every single turn only manages it
 * as often as the game allows.
 *
 * So the mock here is deliberately the worst case. `MOCK_DREAM=1` reports an
 * echo on every turn it is offered one — which is not a strawman, it is what a
 * 7B model actually does when handed "mention this occasionally", and the whole
 * reason the gate is a number on the server rather than a sentence in a prompt.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. MOCK_DREAM=1 on the mock storyteller, and the app started.
 *   3. npx tsx tests/dreams.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";
import { ECHO_COOLDOWN_TURNS } from "../lib/game/dreams.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@localhost:5432/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const WISH = "I want to find out who left me on the step.";

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

  await buildCharacter(page, "Mira", "Human", "Trickster", { pronouns: "she/her" });
  await buildCharacter(page, "Rowan", "Human", "Guardian", { pronouns: "they/them" });

  const user = await db.user.findFirstOrThrow({ where: { email: "dad@example.test" } });
  const [mira, rowan] = await Promise.all([
    db.character.findFirstOrThrow({ where: { name: "Mira" } }),
    db.character.findFirstOrThrow({ where: { name: "Rowan" } }),
  ]);

  // ---- She writes it down ---------------------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  await page.waitForLoadState("networkidle");

  check("a new adventurer is asked what she has always wanted",
    await page.locator('input[name="wish"]').isVisible());

  await page.fill('input[name="wish"]', WISH);
  await page.getByRole("button", { name: /Write it down/ }).click();
  // Waiting for the wish itself to appear rather than for the network to go
  // quiet: a server action does not navigate, so `networkidle` resolves before
  // the write has landed.
  await page.locator(`text=${WISH}`).first().waitFor({ timeout: 15_000 });

  const written = await db.dream.findFirst({ where: { characterId: mira.id, status: "ACTIVE" } });
  check("and it is kept in her own words", written?.wish === WISH, written?.wish);
  check("with the world not yet having said anything",
    (await page.locator("text=/has not said anything/").count()) > 0);

  // ---- The world whispers, at the pace the game sets -------------------------
  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "The long way round",
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

  const echoCount = async () =>
    db.dreamEcho.count({ where: { dream: { characterId: mira.id } } });

  await beginCampaign(campaign.id, user.id);

  const take = async () =>
    playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "I ask around about the old basket-makers." },
    ]);

  await take();
  check("the first turn is allowed to say something", (await echoCount()) === 1,
    `${await echoCount()} echoes`);

  // The storyteller reports one every turn it is offered the chance. The game
  // is what stops it — this is the claim the whole feature rests on.
  await take();
  await take();
  check(
    "and a storyteller trying every turn gets no further",
    (await echoCount()) === 1,
    `${await echoCount()} after three turns`,
  );

  // Wind the clock past the cooldown rather than playing six more turns. The
  // gate reads the turn counter, so this is the same thing the game would see.
  await db.campaign.update({
    where: { id: campaign.id },
    data: { turnCounter: { increment: ECHO_COOLDOWN_TURNS } },
  });
  await take();
  check("until enough of the story has passed", (await echoCount()) === 2,
    `${await echoCount()} echoes`);

  // ---- What she sees for it -------------------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  await page.waitForLoadState("networkidle");

  check("the sheet counts what the world has said",
    (await page.locator("text=/2 times now/").count()) > 0);
  check("and shows what it actually said",
    (await page.locator("text=/A pedlar mentions a basket/").count()) > 0);

  // ---- Only the family may end it -------------------------------------------
  const stillOpen = await db.dream.findFirstOrThrow({ where: { characterId: mira.id } });
  check("four turns of story did not answer it", stillOpen.status === "ACTIVE", stillOpen.status);

  await page.fill('input[name="note"]', "The basket-maker's daughter knew her mother.");
  await page.getByRole("button", { name: /It came true/ }).click();
  await page.locator("text=/Wishes that came true/").first().waitFor({ timeout: 15_000 });

  const answered = await db.dream.findFirstOrThrow({ where: { characterId: mira.id } });
  check("and a person saying so does", answered.status === "ANSWERED", answered.status);
  check("recording how it happened", (answered.answeredNote ?? "").includes("basket-maker"),
    answered.answeredNote ?? "");
  check("and which adventure it happened in",
    answered.answeredInCampaignTitle === "The long way round",
    answered.answeredInCampaignTitle ?? "none");

  await page.reload();
  await page.waitForLoadState("networkidle");
  check("it moves to the wishes that came true",
    (await page.locator("text=/Wishes that came true/").count()) > 0);
  check("and she is asked for another",
    await page.locator('input[name="wish"]').isVisible());
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
