/**
 * End-to-end check of the M5 play UI, driven through a real browser against a
 * mock model server — so it runs anywhere, with no GPU.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1
 *   4. npx tsx tests/play.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3399";
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@localhost:5432/hearthlight?schema=public";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function submitAndSettle(page: Page, selector = 'button[type="submit"]') {
  await page.waitForSelector(`${selector}:not([disabled])`);
  await page.click(selector);
  await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Polls until a condition holds.
 *
 * Assertions about what was committed must wait on the database, not on text
 * appearing. Waiting on the UI is how this test first went wrong: the phrase it
 * watched for also occurs in a textarea placeholder, so it asserted before the
 * server had finished.
 */
async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`  (timed out waiting for ${label})`);
  return false;
}

async function buildCharacter(page: Page, name: string, race: string, archetype: string) {
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', name);
  await page.selectOption("select#choice-race", race);
  await page.selectOption("select#choice-archetype", archetype);
  await submitAndSettle(page, 'button:has-text("Create adventurer")');
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({ where: { isBootstrap: true, redeemedById: null } });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");

  const page = await (await browser.newContext()).newPage();

  // ---- Set up a household, a family and an adventure ----------------------
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Parent");
  await page.fill('input[name="email"]', "parent@example.com");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
  const user = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });

  await buildCharacter(page, "Mira", "Halfling", "Beastfriend");
  await buildCharacter(page, "Rowan", "Human", "Guardian");

  const [mira, rowan] = await db.character.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  // A declared tie, so bond growth has something to attach to.
  await page.goto(`${BASE}/characters/${rowan.id}`);
  await page.selectOption('select[name="kind"]', "SIBLING");
  await page.selectOption('select[name="toId"]', mira.id);
  await submitAndSettle(page, 'button:has-text("Add tie")');

  const dragon = await db.storyline.findUniqueOrThrow({ where: { slug: "the-dragon-who-lost-her-name" } });
  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${dragon.title}")`);
  await page.click('button:has-text("Mira")');
  await page.click('button:has-text("Rowan")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');

  const campaign = await db.campaign.findFirstOrThrow();

  // ---- Play is private ----------------------------------------------------
  {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/campaigns/${campaign.id}/play`);
    check("signed-out user cannot reach the table", anon.url().includes("/login"), anon.url());
    await anon.close();
  }

  // ---- Beginning the adventure -------------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  check("the party bar shows everyone", (await page.textContent("body"))?.includes("Mira") === true);

  await page.click('button:has-text("Begin the adventure")');

  const opened = await waitFor(
    "the opening scene",
    async () => (await db.turnEvent.count({ where: { type: "NARRATION" } })) === 1,
  );
  check("the opening narration was recorded", opened);

  const afterOpening = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("campaign became ACTIVE", afterOpening.status === "ACTIVE", afterOpening.status);
  check("a scene was created", (await db.scene.count({ where: { campaignId: campaign.id } })) === 1);
  check("the opening is on screen", /flattened in a wide circle/i.test((await page.textContent("body")) ?? ""));

  // ---- Taking a turn ------------------------------------------------------
  await page.reload();
  await page.click('button:has-text("What do you do?")');
  check("the first character is asked by name", (await page.textContent("body"))?.includes("Mira, what do you do?") === true);

  await page.fill("textarea", "I hum to it, like I do with the goats.");
  await page.click('button:has-text("Next")');
  check("the second character is asked next", (await page.textContent("body"))?.includes("Rowan, what do you do?") === true);

  await page.fill("textarea", "I stand between it and my sister.");
  await page.click('button:has-text("Done")');
  check("a review step appears before sending", (await page.textContent("body"))?.includes("Ready?") === true);

  await page.click('button:has-text("Tell the storyteller")');

  // Progress must appear rather than a bare spinner.
  await page.waitForSelector("text=/storyteller is considering|Rolling the dice|Writing what happens/i", {
    timeout: 20_000,
  });
  check("progress is shown while the model works", true);

  const turnDone = await waitFor(
    "the turn to commit",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 1,
  );
  check("the turn completed", turnDone);

  // ---- What the turn committed -------------------------------------------
  const actions = await db.turnEvent.findMany({ where: { type: "PLAYER_ACTION" } });
  check("both declared actions were recorded", actions.length === 2, String(actions.length));

  const rolls = await db.turnEvent.findMany({ where: { type: "DICE_ROLL" } });
  check("the adjudicated check was rolled", rolls.length === 1, String(rolls.length));

  const rollMeta = rolls[0]?.metadata as Record<string, unknown>;
  check("the roll is a real d20", Number(rollMeta.roll) >= 1 && Number(rollMeta.roll) <= 20, String(rollMeta.roll));
  check("the roll records its outcome", typeof rollMeta.outcome === "string", String(rollMeta.outcome));

  const miraAfter = await db.character.findUniqueOrThrow({ where: { id: mira.id } });
  check("the character who rolled earned xp", miraAfter.xp > 0, `xp=${miraAfter.xp}`);

  const rowanAfter = await db.character.findUniqueOrThrow({ where: { id: rowan.id } });
  check("the character who did not roll earned none", rowanAfter.xp === 0, `xp=${rowanAfter.xp}`);

  const memories = await db.memory.findMany({ where: { campaignId: campaign.id } });
  check("a memory was extracted", memories.length === 1, memories.map((m) => m.key).join(", "));

  const bond = await db.relationship.findFirstOrThrow();
  check("the bond moment deepened a declared tie", bond.bondXp === 1, `bondXp=${bond.bondXp}`);

  check("model calls were logged for debugging", (await db.aiCall.count()) > 0);

  // ---- The transcript survives a reload -----------------------------------
  await page.reload();
  const body = (await page.textContent("body")) ?? "";
  check("the player's own words are in the transcript", body.includes("like I do with the goats"));
  check("the dice result is in the transcript", /Success|Critical|Partly|Complication/.test(body));
  check("the narration is in the transcript", /hums, low and steady/i.test(body));

  // ---- Another household cannot reach the table ---------------------------
  {
    const invite = await db.inviteCode.create({ data: { code: "HEARTH-TEST-7777" } });
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(`${BASE}/register`);
    await stranger.fill('input[name="inviteCode"]', invite.code);
    await stranger.fill('input[name="displayName"]', "Stranger");
    await stranger.fill('input[name="email"]', "stranger@example.com");
    await stranger.fill('input[name="password"]', "another long password");
    await submitAndSettle(stranger);
    await stranger.waitForURL(`${BASE}/`);

    const response = await stranger.goto(`${BASE}/campaigns/${campaign.id}/play`);
    check("another household gets a 404 at the table", response?.status() === 404, String(response?.status()));

    // And cannot drive the turn endpoint directly.
    const status = await stranger.evaluate(async (campaignId) => {
      const reply = await fetch(`/api/campaigns/${campaignId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "turn", actions: [] }),
      });
      const text = await reply.text();
      return { ok: reply.ok, text: text.slice(0, 200) };
    }, campaign.id);
    check(
      "the turn endpoint refuses another household",
      /not found/i.test(status.text) || !status.ok,
      status.text,
    );
    await stranger.close();
  }

  const turnsBefore = await db.turnEvent.count();
  check("no extra turns were written by the stranger", turnsBefore === actions.length + rolls.length + 2);

  await page.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
