/**
 * End-to-end check that a television can be adopted, and cannot overreach.
 *
 * The pairing flow is the easy half and is checked first. The half worth having
 * a test for is what a screen token *cannot* do: it holds a credential nobody
 * typed, sitting in a browser on a device that stays switched on in a room
 * where visitors sit, and it is the only credential in this application issued
 * without an account behind it. So the assertions that matter are the refusals.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. Start the app on 3399.
 *   3. npx tsx tests/screen.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { buildCharacter } from "./e2e-helpers.mts";

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

async function chooseOption(page: Page, selectId: string, hiddenName: string, value: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.selectOption(selectId, value);
    const applied = await page.inputValue(`input[name="${hiddenName}"]`).catch(() => "");
    if (applied === value) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`${selectId} never accepted ${value} — hydration may have failed.`);
}

/** Asks as a television would: bearer token, nothing else. */
async function asScreen(path: string, token: string) {
  return fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) {
    throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");
  }

  const page = await (await browser.newContext()).newPage();

  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Parent");
  await page.fill('input[name="email"]', "parent@example.com");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);

  // "HUMAN" and "SCOUT" were the shapes of these values long ago; the builder
  // takes the labels a family reads, and there has been no Scout for some time.
  await buildCharacter(page, "Mira", "Human", "Trickster");

  const storyline = await db.storyline.findFirstOrThrow();
  const owner = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });
  const mira = await db.character.findFirstOrThrow({ where: { userId: owner.id } });

  const campaign = await db.campaign.create({
    data: {
      ownerId: owner.id,
      storylineId: storyline.id,
      title: "The Test Evening",
      joinCode: `PARTY-TEST-${Date.now().toString(36).toUpperCase().slice(-4)}`,
      tone: storyline.defaultTone,
      readingLevel: storyline.readingLevel,
      // "seatOrder" became "position" when rounds arrived, and it is required
      // — so this create had been throwing rather than seating anybody.
      party: { create: { characterId: mira.id, position: 0 } },
    },
  });

  // Somebody else's adventure entirely, to point the screen's token at later.
  const stranger = await db.user.create({
    data: { email: "stranger@example.com", displayName: "Stranger", passwordHash: "x" },
  });
  const strangerCharacter = await db.character.create({
    data: { userId: stranger.id, name: "Nobody", race: "HUMAN", archetype: "SCOUT" },
  });

  console.log("\n— a television asks to be adopted —");

  const registered = await fetch(`${BASE}/api/screen/register`, { method: "POST" });
  const { code, token } = (await registered.json()) as { code: string; token: string };

  check("registering needs no account", registered.ok);
  check("it is handed a code to display", /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code), code);

  const beforePairing = await asScreen("/api/screen/state", token);
  const waiting = (await beforePairing.json()) as { state: string };
  check("before adoption it sees nothing", waiting.state === "waiting", waiting.state);

  const beforeImage = await asScreen("/api/screen/scene-image", token);
  check("and no pictures either", beforeImage.status === 404, `${beforeImage.status}`);

  console.log("\n— it cannot adopt itself —");

  const selfPair = await fetch(`${BASE}/api/campaigns/${campaign.id}/screens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  check(
    "a screen token is not a sign-in",
    selfPair.status === 401 || selfPair.status === 403 || selfPair.status === 404,
    `${selfPair.status}`,
  );

  console.log("\n— the phone adopts it —");

  await page.goto(`${BASE}/campaigns/${campaign.id}`);
  await page.click('button:has-text("Send to a screen")');
  await page.fill("#screen-code", code);
  await page.fill("#screen-label", "Living room");
  await page.click('button:has-text("Send it")');
  await page.waitForSelector('text=Living room', { timeout: 10_000 });

  const paired = (await (await asScreen("/api/screen/state", token)).json()) as {
    state: string;
    view?: { campaignTitle: string; party: { name: string }[] };
  };
  check("the television is showing the adventure", paired.state === "paired", paired.state);
  check("with the right story", paired.view?.campaignTitle === "The Test Evening");
  check("and the party on it", paired.view?.party.some((member) => member.name === "Mira") === true);

  console.log("\n— the code is spent —");

  const row = await db.screenPairing.findFirstOrThrow({ where: { campaignId: campaign.id } });
  check("the code is cleared once used", row.code === null, `${row.code}`);

  const reuse = await fetch(`${BASE}/api/campaigns/${campaign.id}/screens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  check("and cannot be rung twice", !reuse.ok, `${reuse.status}`);

  console.log("\n— what it is not allowed to see —");

  // A personal aim, which is the one thing on the board that is deliberately
  // not shared with the room.
  await db.quest.create({
    data: {
      campaignId: campaign.id,
      title: "Mira's own aim",
      summary: "Hers until she says it.",
      status: "ACTIVE",
      secretForCharacterId: mira.id,
    },
  });
  await db.quest.create({
    data: {
      campaignId: campaign.id,
      title: "Find the way home",
      summary: "Everybody's.",
      status: "ACTIVE",
    },
  });

  const withQuests = (await (await asScreen("/api/screen/state", token)).json()) as {
    view: { quests: { title: string }[] };
  };
  const titles = withQuests.view.quests.map((quest) => quest.title);
  check("shared quests are shown", titles.includes("Find the way home"));
  check("personal aims are not", !titles.includes("Mira's own aim"), titles.join(", "));

  const wholeBody = JSON.stringify(withQuests);
  check("nor anywhere else in the payload", !wholeBody.includes("Mira's own aim"));
  check("and neither is the join code", !wholeBody.includes(campaign.joinCode));

  console.log("\n— it cannot reach past its own adventure —");

  const strangerPortrait = await asScreen(`/api/screen/portrait/${strangerCharacter.id}`, token);
  check(
    "an adventurer from another party is not there",
    strangerPortrait.status === 404,
    `${strangerPortrait.status}`,
  );

  const badToken = await asScreen("/api/screen/state", `${token}x`);
  check("a tampered token opens nothing", badToken.status === 404, `${badToken.status}`);

  console.log("\n— only the household that started it may pair —");

  // A second account with a character in the party: a member, not the owner.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestInvite = await db.inviteCode.create({
    data: { code: `HEARTH-GUEST-${Date.now().toString(36).slice(-4).toUpperCase()}`, createdById: owner.id },
  });
  await guestPage.goto(`${BASE}/register`);
  await guestPage.fill('input[name="inviteCode"]', guestInvite.code);
  await guestPage.fill('input[name="displayName"]', "Guest");
  await guestPage.fill('input[name="email"]', "guest@example.com");
  await guestPage.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(guestPage);

  const guest = await db.user.findUniqueOrThrow({ where: { email: "guest@example.com" } });
  const guestCharacter = await db.character.create({
    data: { userId: guest.id, name: "Tam", race: "HUMAN", archetype: "SCOUT" },
  });
  await db.partyMember.create({
    data: { campaignId: campaign.id, characterId: guestCharacter.id, seatOrder: 2 },
  });

  const second = await fetch(`${BASE}/api/screen/register`, { method: "POST" });
  const { code: guestCode } = (await second.json()) as { code: string };

  const guestPair = await guestPage.evaluate(
    async ([id, pairingCode]) => {
      const response = await fetch(`/api/campaigns/${id}/screens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairingCode }),
      });
      return response.status;
    },
    [campaign.id, guestCode],
  );
  check("a player who is not the host cannot", guestPair === 403, `${guestPair}`);

  console.log("\n— unpairing takes it back —");

  await page.reload();
  await page.click('button:has-text("Stop")');
  await page.waitForTimeout(1500);

  const afterUnpair = await asScreen("/api/screen/state", token);
  check("the token stops working at once", afterUnpair.status === 404, `${afterUnpair.status}`);

  const remaining = await db.screenPairing.count({ where: { campaignId: campaign.id } });
  check("and the row is gone", remaining === 0, `${remaining} left`);

  console.log("\n— deleting the adventure unpairs its screens —");

  const third = await fetch(`${BASE}/api/screen/register`, { method: "POST" });
  const { code: thirdCode, token: thirdToken } = (await third.json()) as {
    code: string;
    token: string;
  };
  await page.goto(`${BASE}/campaigns/${campaign.id}`);
  await page.click('button:has-text("Send to a screen")');
  await page.fill("#screen-code", thirdCode);
  await page.click('button:has-text("Send it")');
  await page.waitForTimeout(1500);

  await db.campaign.delete({ where: { id: campaign.id } });

  const orphaned = await asScreen("/api/screen/state", thirdToken);
  check("the television is let go with it", orphaned.status === 404, `${orphaned.status}`);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
