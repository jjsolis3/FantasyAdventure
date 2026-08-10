/**
 * End-to-end check of inviting somebody else's adventurer.
 *
 * The case this covers is the one that made the app unusable for a household
 * where everybody has their own sign-in: one account, one character, and a
 * storyline that needs two. Before invitations there was no way through it
 * except making a second character yourself and playing both.
 *
 * Two browsers, because the whole point is that the second answer comes from
 * somebody else.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1
 *   4. npx tsx tests/invites.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { generateInviteCode, generateJoinCode } from "../lib/auth/invite-code.ts";

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

async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`  (timed out waiting for ${label})`);
  return false;
}

async function chooseOption(page: Page, selectId: string, hiddenName: string, value: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.selectOption(selectId, value);
    const applied = await page.inputValue(`input[name="${hiddenName}"]`).catch(() => "");
    if (applied === value) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`${selectId} never accepted ${value} — hydration may have failed.`);
}

async function buildCharacter(page: Page, name: string, race: string, archetype: string) {
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', name);
  await chooseOption(page, "select#choice-race", "race", race);
  await chooseOption(page, "select#choice-archetype", "archetype", archetype);
  await submitAndSettle(page, 'button:has-text("Create adventurer")');
}

async function register(context: BrowserContext, code: string, name: string, email: string) {
  const page = await context.newPage();
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', code);
  await page.fill('input[name="displayName"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
  return page;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");

  // ---- A parent with exactly one adventurer --------------------------------
  const hostContext = await browser.newContext();
  const host = await register(hostContext, bootstrap.code, "Parent", "parent@example.com");
  const hostUser = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });
  await buildCharacter(host, "Mira", "Halfling", "Beastfriend");
  const mira = await db.character.findFirstOrThrow({ where: { userId: hostUser.id } });

  // ---- A child with their own sign-in and their own adventurer -------------
  const childInvite = await db.inviteCode.create({
    data: { code: generateInviteCode(), createdById: hostUser.id, note: "daughter" },
  });
  const childContext = await browser.newContext();
  const child = await register(childContext, childInvite.code, "Daughter", "daughter@example.com");
  const childUser = await db.user.findUniqueOrThrow({ where: { email: "daughter@example.com" } });
  await buildCharacter(child, "Wren", "Human", "Trickster");
  const wren = await db.character.findFirstOrThrow({ where: { userId: childUser.id } });

  // ---- Setting up: the other household's adventurer is offered -------------
  const dragon = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-dragon-who-lost-her-name" },
  });

  await host.goto(`${BASE}/campaigns/new`);
  const setupBody = (await host.textContent("body")) ?? "";
  // The reported bug exactly: a child signs in, makes their first adventurer,
  // and is invisible to the parent trying to start an adventure with them.
  check("somebody else's adventurer is offered", setupBody.includes("Wren"));
  check("along with who plays them", setupBody.includes("played by Daughter"));

  await host.click(`button:has-text("${dragon.title}")`);
  await host.click('button:has-text("Mira")');
  await host.click('button[aria-pressed]:has-text("Wren")');
  await host.fill('input[name="title"]', "The Naming Flight");
  await submitAndSettle(host, 'button:has-text("Begin the preparations")');

  const created = await waitFor(
    "the adventure to be created",
    async () => (await db.campaign.count({ where: { ownerId: hostUser.id } })) > 0,
    15_000,
  );
  if (!created) {
    const alerts = await host.$$eval('[role="status"]', (nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
    throw new Error(`Campaign was not created. Page said: ${alerts.join(" | ") || "(nothing)"}`);
  }

  const campaign = await db.campaign.findFirstOrThrow({ where: { ownerId: hostUser.id } });
  check(
    "one adventurer of your own plus one invitation clears the minimum of two",
    (await db.partyMember.count({ where: { campaignId: campaign.id } })) === 1,
  );

  const invite = await db.partyInvite.findFirstOrThrow({ where: { campaignId: campaign.id } });
  check("an invitation was sent rather than a party place taken", invite.characterId === wren.id);
  check("and is waiting to be answered", invite.status === "PENDING", invite.status);

  // ---- The adventure will not begin until it is answered -------------------
  await host.goto(`${BASE}/campaigns/${campaign.id}`);
  const hostBody = (await host.textContent("main")) ?? "";
  check("the owner is told who is being waited on", hostBody.includes("Waiting on the others"));
  check(
    "and there is nothing to press to begin",
    (await host.locator('a:has-text("Begin the adventure")').count()) === 0,
  );

  // Not even by asking the turn pipeline directly, which is what the button on
  // the play page does.
  const forced = await hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/turn`, {
    data: { mode: "begin" },
    failOnStatusCode: false,
  });
  const forcedBody = await forced.text();
  check(
    "the server refuses to begin while somebody has not answered",
    (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "SETUP",
    String(forced.status()),
  );
  check("and says who it is waiting for", forcedBody.includes("Wren"), forcedBody.slice(0, 200));

  // ---- The invited household is asked --------------------------------------
  await child.goto(`${BASE}/campaigns`);
  const childBody = (await child.textContent("main")) ?? "";
  check("the invitation reaches the other household", childBody.includes("has asked Wren along"));
  check("and says which adventure it is for", childBody.includes("The Naming Flight"));

  // The person who sent it does not get to answer it.
  await host.goto(`${BASE}/campaigns`);
  check(
    "the household that asked is not offered the answer",
    !((await host.textContent("main")) ?? "").includes("Wren is coming"),
  );

  // ---- Accepting ------------------------------------------------------------
  await submitAndSettle(child, 'button:has-text("Yes, Wren is coming")');

  const accepted = await waitFor(
    "the invitation to be accepted",
    async () =>
      (await db.partyInvite.findUniqueOrThrow({ where: { id: invite.id } })).status === "ACCEPTED",
    15_000,
  );
  check("saying yes is recorded", accepted);
  check(
    "and puts them in the party",
    (await db.partyMember.count({ where: { campaignId: campaign.id, characterId: wren.id } })) === 1,
  );

  // The adventure is now theirs to see too.
  const childView = await childContext.request.get(`${BASE}/campaigns/${campaign.id}`);
  check("the adventure opens for them", childView.status() === 200, String(childView.status()));

  // ---- And now it can begin -------------------------------------------------
  await host.goto(`${BASE}/campaigns/${campaign.id}`);
  check(
    "the owner can start once everybody has said yes",
    (await host.locator('a:has-text("Begin the adventure")').count()) === 1,
  );

  // ---- Declining leaves a way to ask again ---------------------------------
  const second = await db.campaign.create({
    data: {
      ownerId: hostUser.id,
      storylineId: dragon.id,
      title: "The Second Flight",
      joinCode: generateJoinCode(),
      tone: "COZY",
      readingLevel: "FAMILY_MIXED",
      party: { create: [{ characterId: mira.id, position: 0 }] },
      invites: { create: [{ characterId: wren.id, invitedById: hostUser.id }] },
    },
  });

  await child.goto(`${BASE}/campaigns`);
  await submitAndSettle(child, 'button:has-text("Not this time")');

  const declined = await waitFor(
    "the invitation to be declined",
    async () =>
      (await db.partyInvite.findFirstOrThrow({ where: { campaignId: second.id } })).status ===
      "DECLINED",
    15_000,
  );
  check("saying no is recorded", declined);
  check(
    "and does not put them in the party",
    (await db.partyMember.count({ where: { campaignId: second.id } })) === 1,
  );

  await host.goto(`${BASE}/campaigns/${second.id}`);
  const secondBody = (await host.textContent("main")) ?? "";
  check("the owner is told they cannot come", secondBody.includes("cannot come this time"));
  check(
    "and can ask again",
    (await host.locator('button[aria-label="Invite Wren"]').count()) === 1,
  );

  await submitAndSettle(host, 'button[aria-label="Invite Wren"]');
  const reasked = await waitFor(
    "the invitation to be sent again",
    async () =>
      (await db.partyInvite.findFirstOrThrow({ where: { campaignId: second.id } })).status ===
      "PENDING",
    15_000,
  );
  check("asking again works", reasked);

  // ---- Taking an invitation back -------------------------------------------
  await host.goto(`${BASE}/campaigns/${second.id}`);
  await submitAndSettle(host, 'button[aria-label="Take back the invitation to Wren"]');
  const withdrawn = await waitFor(
    "the invitation to be withdrawn",
    async () => (await db.partyInvite.count({ where: { campaignId: second.id } })) === 0,
    15_000,
  );
  check("an invitation can be taken back", withdrawn);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
