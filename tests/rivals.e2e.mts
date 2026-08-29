/**
 * Somebody who keeps turning up and is after the same thing they are.
 *
 * ## What a real chapter proves that a unit test cannot
 *
 * **That once a chapter means once a chapter.** `MOCK_RIVAL=1` reports a
 * meeting on every turn the storyteller is told about them — the same worst
 * case as the dream mock, and the same reason the gate is a rule on the server
 * rather than a request in a prompt.
 *
 * **That the score is earned rather than set.** Nothing on the household page
 * can move it; the only thing that does is a turn where they crossed paths.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. MOCK_RIVAL=1 on the mock storyteller, and the app started.
 *   3. npx tsx tests/rivals.e2e.mts
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

const NAME = "Bex Underhill";

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

  // ---- Giving them one ------------------------------------------------------
  await page.goto(`${BASE}/characters`);
  await page.waitForLoadState("networkidle");

  check("a household is offered a rival", await page.locator('input[name="name"]').isVisible());

  await page.fill('input[name="name"]', NAME);
  await page.fill(
    'input[name="about"]',
    "A boy with a very good coat who has never once admitted to being wrong.",
  );
  await page.fill('input[name="wants"]', "To be the one who found it.");
  await page.getByRole("button", { name: /Give them a rival/ }).click();
  await page.locator(`text=${NAME}`).first().waitFor({ timeout: 15_000 });

  const made = await db.rival.findUniqueOrThrow({ where: { ownerId: user.id } });
  check("and it is kept", made.name === NAME, made.name);
  check("with nothing settled between them yet",
    made.partyAhead === 0 && made.rivalAhead === 0);
  check("which the page says out loud",
    (await page.locator("text=/yet to settle anything/").count()) > 0);

  // ---- Once a chapter -------------------------------------------------------
  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "The race for it",
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

  const meetings = async () => db.rivalMeeting.count({ where: { rival: { ownerId: user.id } } });

  await beginCampaign(campaign.id, user.id);

  const take = async () =>
    playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "I run for the thing we came for." },
    ]);

  await take();
  check("he turns up", (await meetings()) === 1, `${await meetings()} meetings`);

  // The storyteller reports one on every turn it is told about him. The game is
  // what stops it — this is the claim.
  await take();
  await take();
  check(
    "and a storyteller trying every turn gets no further this chapter",
    (await meetings()) === 1,
    `${await meetings()} after three turns`,
  );

  // A different chapter is fair game. Moved directly rather than played to,
  // because what is being tested is the gate, not the chapter machinery.
  await db.campaign.update({ where: { id: campaign.id }, data: { currentActIndex: 2 } });
  await take();
  check("but the next chapter is", (await meetings()) === 2, `${await meetings()} meetings`);

  // ---- The scoreboard -------------------------------------------------------
  const after = await db.rival.findUniqueOrThrow({ where: { ownerId: user.id } });
  check("losing to him puts him ahead", after.rivalAhead === 2, `${after.partyAhead}–${after.rivalAhead}`);
  check("and the party is not credited for it", after.partyAhead === 0);

  await page.goto(`${BASE}/characters`);
  await page.waitForLoadState("networkidle");
  check("the household sees the score",
    (await page.locator(`text=/${NAME} is ahead of you, 2 to 0/`).count()) > 0);
  check("and what he did", (await page.locator("text=/holding it, and said so twice/").count()) > 0);

  // ---- Sharpening him does not reset the rivalry ----------------------------
  await page.getByRole("button", { name: /Change them/ }).click();
  await page.fill('input[name="about"]', "Still has the coat. Still insufferable.");
  await page.getByRole("button", { name: /Save them/ }).click();
  await page.locator("text=/Still insufferable/").first().waitFor({ timeout: 15_000 });

  const rewritten = await db.rival.findUniqueOrThrow({ where: { ownerId: user.id } });
  check("a family sharpening the description keeps the score",
    rewritten.rivalAhead === 2 && rewritten.partyAhead === 0,
    `${rewritten.partyAhead}–${rewritten.rivalAhead}`);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
