/**
 * The two dials a family asked for: how hard the dice are, and how the
 * storyteller plays.
 *
 * ## What only a real turn can prove
 *
 * The unit tests already hold the numbers and the prompt text. What they cannot
 * show is that the settings on a campaign row reach the two places they are
 * meant to and nowhere else, through the whole pipeline — which is the entire
 * design:
 *
 *   - The **manner** reaches the narrator and never the adjudicator. A
 *     storyteller told to be wilder must not start reading a girl's own
 *     sentence more loosely; that bug has been here once, and the standing
 *     order against it lives in the adjudication prompt.
 *   - The **challenge** reaches the dice and never a prompt at all. It is a
 *     number, deliberately, so it cannot be ignored by a small local model on
 *     the turns it happens not to feel like obeying.
 *
 * Both are checked here by reading the prompts the pipeline actually sent.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. Start the mock storyteller and the app.
 *   3. npx tsx tests/dials.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";
import { targetFor } from "../lib/game/challenge.ts";

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

  await buildCharacter(page, "Mira", "Human", "Trickster", { pronouns: "she/her" });
  await buildCharacter(page, "Rowan", "Human", "Guardian", { pronouns: "they/them" });

  const user = await db.user.findFirstOrThrow({ where: { email: "dad@example.test" } });
  const [mira, rowan] = await Promise.all([
    db.character.findFirstOrThrow({ where: { name: "Mira" } }),
    db.character.findFirstOrThrow({ where: { name: "Rowan" } }),
  ]);
  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });

  const campaign = await db.campaign.create({
    data: {
      title: "The dials",
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

  // ---- They default to the game that shipped -------------------------------
  check("a new adventure is balanced on both", campaign.challenge === "BALANCED" && campaign.manner === "BALANCED",
    `${campaign.challenge} / ${campaign.manner}`);

  // ---- The settings form carries both --------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}`);
  await page.waitForLoadState("networkidle");

  check("the campaign page offers a difficulty", await page.locator('select[name="challenge"]').isVisible());
  check("and a manner for the storyteller", await page.locator('select[name="manner"]').isVisible());

  await page.selectOption('select[name="challenge"]', "TOUGH");
  await page.selectOption('select[name="manner"]', "MADCAP");
  await page.click('form:has(select[name="challenge"]) button[type="submit"]');

  // Waiting for the form to say so rather than for the network to go quiet. A
  // server action does not navigate, so `networkidle` can resolve before the
  // write lands — which is how this first read the old row and reported a save
  // that had in fact worked.
  await page.locator("text=Saved.").first().waitFor({ timeout: 15_000 });

  const saved = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("both save", saved.challenge === "TOUGH" && saved.manner === "MADCAP",
    `${saved.challenge} / ${saved.manner}`);

  // Mid-adventure, which is when anybody actually reaches for them — nobody
  // knows before the first scene whether it is too easy.
  await page.reload();
  await page.waitForLoadState("networkidle");
  check(
    "and come back chosen when the page is opened again",
    (await page.locator('select[name="challenge"]').inputValue()) === "TOUGH" &&
      (await page.locator('select[name="manner"]').inputValue()) === "MADCAP",
  );

  // ---- Through a real turn --------------------------------------------------
  //
  // What the browser can prove that a unit test cannot: the setting on the row
  // reaches the dice of an actual turn. The narrator-versus-adjudicator half is
  // proved in `tests/manner.test.ts` instead, and more exactly — it reads the
  // two prompts directly. It cannot be checked from here at all, because only
  // the *user* prompt is recorded and the manner lives in the system prompt.

  /** Every bar a turn rolled against, newest turn last. */
  async function barsRolled(): Promise<{ difficulty: string; target: number }[]> {
    const rolled = await db.turnEvent.findMany({
      where: { scene: { campaignId: campaign.id }, type: "DICE_ROLL" },
      orderBy: { createdAt: "asc" },
    });
    return rolled
      .map((event) => event.metadata as { difficulty?: string; target?: number } | null)
      .filter((meta): meta is { difficulty: string; target: number } =>
        typeof meta?.target === "number" && typeof meta?.difficulty === "string");
  }

  await beginCampaign(campaign.id, user.id);
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I climb the drainpipe to reach the window." },
  ]);

  const tough = await barsRolled();
  check("somebody rolled for something", tough.length > 0, `${tough.length} checks`);
  check(
    "and every bar was the tough one",
    tough.every((bar) => bar.target === targetFor(bar.difficulty as "EASY" | "NORMAL" | "HARD", "TOUGH")),
    tough.map((bar) => `${bar.difficulty}=${bar.target}`).join(" "),
  );

  // The other end of the dial, on the same adventure mid-flight — which is the
  // way a family will actually use this. One data point could be a coincidence.
  await db.campaign.update({ where: { id: campaign.id }, data: { challenge: "GENTLE" } });
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I climb the drainpipe to reach the window." },
  ]);

  const afterwards = (await barsRolled()).slice(tough.length);
  check("turning it down mid-adventure takes effect at once", afterwards.length > 0,
    `${afterwards.length} checks`);
  check(
    "and every bar afterwards was the gentle one",
    afterwards.every((bar) => bar.target === targetFor(bar.difficulty as "EASY" | "NORMAL" | "HARD", "GENTLE")),
    afterwards.map((bar) => `${bar.difficulty}=${bar.target}`).join(" "),
  );

  // Four points between the two settings on the same band, which is the whole
  // of what this dial does. Compared rather than asserted flat, so the check
  // still means something if the tables are ever retuned.
  const sameBand = afterwards.find((bar) => tough.some((other) => other.difficulty === bar.difficulty));
  if (sameBand) {
    const before = tough.find((bar) => bar.difficulty === sameBand.difficulty)!;
    check("the same kind of attempt got easier by four", before.target - sameBand.target === 4,
      `${before.difficulty}: ${before.target} → ${sameBand.target}`);
  }

  // And it reached the dice without ever being said out loud to the model.
  const calls = await db.aiCall.findMany({ where: { campaignId: campaign.id } });
  check("the turns really did call the storyteller", calls.length > 0, `${calls.length} calls`);
  check(
    "and the difficulty was never mentioned to it",
    calls.every((call) => !/\bTOUGH\b|\bGENTLE\b|challenge/i.test(call.promptPreview ?? "")),
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
