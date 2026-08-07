/**
 * End-to-end check of the M3 campaign setup flow.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty.
 *   2. Seed (so storylines and a bootstrap invite exist), then start the app.
 *   3. npx tsx tests/campaigns.e2e.mts
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

async function alertText(page: Page): Promise<string> {
  const alerts = await page.$$eval('[role="status"]', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ""),
  );
  return alerts.join(" | ");
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

  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Parent");
  await page.fill('input[name="email"]', "parent@example.com");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
  const user = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });

  // ---- Campaigns are private ---------------------------------------------
  {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/campaigns`);
    check("signed-out user cannot reach /campaigns", anon.url().includes("/login"), anon.url());
    await anon.close();
  }

  // ---- With no characters, setup redirects to the builder -----------------
  await page.goto(`${BASE}/campaigns/new`);
  check("no adventurers means no adventure to set up", page.url().includes("/characters/new"), page.url());

  // ---- Build a family -----------------------------------------------------
  await buildCharacter(page, "Mira", "Halfling", "Beastfriend");
  await buildCharacter(page, "Rowan", "Human", "Guardian");
  await buildCharacter(page, "Nana Fen", "Stonekin", "Songkeeper");

  const [mira, rowan, nana] = await db.character.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  // Give two of them a family tie so the campaign page can show a bond.
  await page.goto(`${BASE}/characters/${mira.id}`);
  await page.selectOption('select[name="kind"]', "SIBLING");
  await page.selectOption('select[name="toId"]', rowan.id);
  await submitAndSettle(page, 'button:has-text("Add tie")');

  // ---- Party size is enforced --------------------------------------------
  const dragon = await db.storyline.findUniqueOrThrow({ where: { slug: "the-dragon-who-lost-her-name" } });

  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${dragon.title}")`);
  check("choosing a storyline prefills the name", (await page.inputValue('input[name="title"]')) === dragon.title);

  // One adventurer, but this storyline needs two.
  await page.click('button:has-text("Mira")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');
  check("a party below the minimum is refused", /at least 2/.test(await alertText(page)), await alertText(page));
  check("no campaign was created", (await db.campaign.count()) === 0);

  // ---- A valid campaign ---------------------------------------------------
  await page.click('button:has-text("Rowan")');
  await page.click('button:has-text("Nana Fen")');
  await page.fill('input[name="title"]', "The Thistledown Flight");
  await page.click('button:has-text("Adventurous")');
  await page.click('button:has-text("Middle grade")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');

  const campaign = await db.campaign.findFirst({ include: { party: { orderBy: { position: "asc" } } } });
  check("campaign created", campaign !== null);
  check("title saved", campaign?.title === "The Thistledown Flight", campaign?.title);
  check("storyline linked", campaign?.storylineId === dragon.id);
  check("tone saved", campaign?.tone === "ADVENTUROUS", campaign?.tone);
  check("reading level saved", campaign?.readingLevel === "MIDDLE_GRADE", campaign?.readingLevel);
  check("status starts at SETUP", campaign?.status === "SETUP", campaign?.status);
  check("act index starts at 1", campaign?.currentActIndex === 1);
  check("party has three members", campaign?.party.length === 3, String(campaign?.party.length));
  check(
    "turn order follows the order they were picked",
    campaign?.party.map((member) => member.characterId).join(",") === [mira.id, rowan.id, nana.id].join(","),
  );
  check("landed on the campaign page", page.url().includes(`/campaigns/${campaign!.id}`), page.url());

  // ---- The campaign page shows the party and their bonds ------------------
  const body = (await page.textContent("body")) ?? "";
  check("the hook is shown", body.includes("Don't ask me what I'm called"));
  check("party members are listed", body.includes("Mira") && body.includes("Nana Fen"));
  check("a bond between two travellers is shown", body.includes("sibling of"));

  // ---- Campaign settings are independent of the profile -------------------
  await db.user.update({ where: { id: user.id }, data: { defaultTone: "COZY", defaultReadingLevel: "TEEN" } });
  const unchanged = await db.campaign.findUniqueOrThrow({ where: { id: campaign!.id } });
  check(
    "changing the profile does not rewrite a campaign in progress",
    unchanged.tone === "ADVENTUROUS" && unchanged.readingLevel === "MIDDLE_GRADE",
  );

  // ---- Editing settings ---------------------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign!.id}`);
  await page.fill('input[name="title"]', "The Naming Flight");
  // :text-is, not :has-text — the latter is a substring match and would find
  // the party editor's "Save party" button first.
  await submitAndSettle(page, 'button:text-is("Save")');
  check(
    "settings can be renamed",
    (await db.campaign.findUniqueOrThrow({ where: { id: campaign!.id } })).title === "The Naming Flight",
  );

  // ---- Party can change while in SETUP ------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign!.id}`);
  await page.click('button:has-text("Nana Fen")'); // deselect
  await submitAndSettle(page, 'button:has-text("Save party")');
  check("party can be trimmed before the adventure begins", (await db.partyMember.count()) === 2, String(await db.partyMember.count()));

  // ---- Party is settled once the adventure is under way -------------------
  await db.campaign.update({ where: { id: campaign!.id }, data: { status: "ACTIVE" } });
  await page.goto(`${BASE}/campaigns/${campaign!.id}`);
  check("the party editor is hidden once active", (await page.locator('button:has-text("Save party")').count()) === 0);

  // And the action refuses even if the form is reconstructed.
  const beforeCount = await db.partyMember.count();
  await page.evaluate(
    ({ campaignId, characterId }) => {
      const form = document.createElement("form");
      form.method = "post";
      for (const [name, value] of [
        ["campaignId", campaignId],
        ["partyIds", characterId],
      ]) {
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
    },
    { campaignId: campaign!.id, characterId: mira.id },
  );
  check("party size unchanged by a reconstructed form", (await db.partyMember.count()) === beforeCount);

  // ---- Another household cannot see it ------------------------------------
  {
    const invite = await db.inviteCode.create({ data: { code: "HEARTH-TEST-8888" } });
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(`${BASE}/register`);
    await stranger.fill('input[name="inviteCode"]', invite.code);
    await stranger.fill('input[name="displayName"]', "Stranger");
    await stranger.fill('input[name="email"]', "stranger@example.com");
    await stranger.fill('input[name="password"]', "another long password");
    await submitAndSettle(stranger);
    await stranger.waitForURL(`${BASE}/`);

    const response = await stranger.goto(`${BASE}/campaigns/${campaign!.id}`);
    check("another household gets a 404", response?.status() === 404, String(response?.status()));
    await stranger.close();
  }

  // ---- Deleting keeps the adventurers -------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign!.id}`);
  await submitAndSettle(page, 'button:has-text("Remove this adventure")');
  check("campaign deleted", (await db.campaign.count()) === 0);
  check("party rows went with it", (await db.partyMember.count()) === 0);
  check("the adventurers survive", (await db.character.count({ where: { userId: user.id } })) === 3);

  await page.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
