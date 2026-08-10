/**
 * End-to-end check of the parts only an administrator sees: writing your own
 * adventures, reading what the storyteller has used, and putting a picture on a
 * character.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. Start the app.
 *   3. npx tsx tests/admin.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { generateInviteCode } from "../lib/auth/invite-code.ts";

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

/** The smallest real PNG: one transparent pixel. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({ where: { isBootstrap: true, redeemedById: null } });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");

  const adminContext = await browser.newContext();
  const admin = await register(adminContext, bootstrap.code, "Parent", "parent@example.com");
  const adminUser = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });

  // A second household, with no administrative powers at all.
  const invite = await db.inviteCode.create({
    data: { code: generateInviteCode(), createdById: adminUser.id },
  });
  const playerContext = await browser.newContext();
  const player = await register(playerContext, invite.code, "Aunt", "aunt@example.com");

  // Built before anything looks at the adventure-setup page: with no adventurers
  // in the household, that page sends you away to build one.
  await admin.goto(`${BASE}/characters/new`);
  await admin.fill('input[name="name"]', "Mira");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await admin.selectOption("select#choice-race", "Halfling");
    if ((await admin.inputValue('input[name="race"]')) === "Halfling") break;
    await admin.waitForTimeout(150);
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await admin.selectOption("select#choice-archetype", "Beastfriend");
    if ((await admin.inputValue('input[name="archetype"]')) === "Beastfriend") break;
    await admin.waitForTimeout(150);
  }
  await submitAndSettle(admin, 'button:has-text("Create adventurer")');
  const mira = await db.character.findFirstOrThrow({ where: { name: "Mira" } });

  // ---- The hub is for administrators ---------------------------------------
  await admin.goto(`${BASE}/settings`);
  check("an administrator reaches the settings hub", admin.url().endsWith("/settings"), admin.url());
  const hub = await admin.locator("main").innerText();
  check("and it gathers the four places", ["storyteller", "Adventures", "used", "Invitations"].every(
    (word) => hub.toLowerCase().includes(word.toLowerCase()),
  ));

  for (const path of ["/settings", "/settings/adventures", "/settings/usage"]) {
    await player.goto(`${BASE}${path}`);
    check(
      `a player is turned away from ${path}`,
      !player.url().includes("/settings"),
      player.url(),
    );
  }

  // ---- The navigation bar ---------------------------------------------------
  //
  // Two links a family uses, and everything about the account behind an avatar.
  await admin.goto(`${BASE}/campaigns`);
  const bar = admin.getByRole("banner");
  check("the two places to go are in the bar", (await bar.innerText()).includes("Adventures"));
  check(
    "and the second one is not another word for the first",
    (await bar.innerText()).includes("Characters"),
  );
  check(
    "the section you are in is marked",
    (await bar.locator('a[aria-current="page"]').innerText()).includes("Adventures"),
  );
  check(
    "administrative doors are not in the bar itself",
    !(await bar.innerText()).includes("Invites") && !(await bar.innerText()).includes("Storyteller"),
  );
  check(
    "and signing out is not competing with the game",
    !(await bar.innerText()).includes("Sign out"),
  );

  // The menu is shut until it is asked for.
  check(
    "the account menu starts closed",
    (await admin.locator('[role="menu"]').count()) === 0,
  );
  await admin.click('button[aria-haspopup="menu"]');
  const menu = admin.locator('[role="menu"]');
  check("it opens on the avatar", (await menu.count()) === 1);
  const menuText = await menu.innerText();
  check("with the profile", menuText.includes("Your profile"));
  check("the settings, for an administrator", menuText.includes("Settings"));
  check("and signing out at the bottom", menuText.trim().endsWith("Sign out"));

  await admin.keyboard.press("Escape");
  check("escape closes it", (await admin.locator('[role="menu"]').count()) === 0);

  // A player has a menu too, with one door fewer.
  await player.goto(`${BASE}/campaigns`);
  await player.click('button[aria-haspopup="menu"]');
  const playerMenu = await player.locator('[role="menu"]').innerText();
  check("a player is not shown a door they cannot open", !playerMenu.includes("Settings"));
  check("but can still reach their profile", playerMenu.includes("Your profile"));
  check("and still sign out", playerMenu.includes("Sign out"));

  // Signed out, the only thing worth offering is the way in.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/`);
  const anonBar = await anon.getByRole("banner").innerText();
  check("signed out, there is a sign-in button", anonBar.includes("Sign in"));
  check("and no account menu", (await anon.locator('button[aria-haspopup="menu"]').count()) === 0);
  await anon.close();

  // ---- Writing an adventure -------------------------------------------------
  await admin.goto(`${BASE}/settings/adventures/new`);
  await admin.fill('input[name="title"]', "The Thing In The Hedge");
  await admin.fill('input[name="tagline"]', "It has been there all week, and it is closer now.");
  await admin.fill(
    'textarea[name="premise"]',
    "Something is living in the hedge at the end of the garden. It is not dangerous; it is lost, and it has been copying the family's voices to try to be let in.",
  );
  await admin.fill(
    'textarea[name="hook"]',
    "The hedge says your name in your mother's voice, and your mother is standing right beside you.",
  );
  await admin.selectOption('select[name="defaultTone"]', "SPOOKY");

  // Three chapters are offered by default; fill the first two and leave one.
  const titles = admin.locator('input[name="actTitle"]');
  const goals = admin.locator('textarea[name="actGoal"]');
  await titles.nth(0).fill("Something In The Leaves");
  await goals.nth(0).fill("Establish that it copies voices, badly, and only when nobody is looking straight at it.");
  await admin.locator('textarea[name="actBeats"]').nth(0).fill("It gets a word wrong\nThe dog will not go near the hedge");
  await admin.locator('textarea[name="actSeeks"]').nth(0).fill("the torch from the shed");
  await titles.nth(1).fill("What It Wants");
  await goals.nth(1).fill("Turn dread into pity: it is lost and cannot say so in its own voice.");
  await titles.nth(2).fill("Letting It In");
  await goals.nth(2).fill("Give the family a way to help it home that costs them something small.");

  await admin.check('input[name="isActive"]');
  await submitAndSettle(admin, 'button:has-text("Create this adventure")');

  const written = await db.storyline.findFirst({
    where: { title: "The Thing In The Hedge" },
    include: { acts: { orderBy: { index: "asc" } } },
  });
  check("an adventure written in the app is saved", written !== null);
  check("with its chapters, in order", written?.acts.length === 3, `${written?.acts.length} acts`);
  check(
    "beats are one per line",
    written?.acts[0].beats.length === 2,
    written?.acts[0].beats.join(" | "),
  );
  check("and so are the things to find", written?.acts[0].seeks.join() === "the torch from the shed");
  check("it is marked as yours, so the seed will leave it alone", written?.isCustom === true);
  check("the tone reached it", written?.defaultTone === "SPOOKY", written?.defaultTone);

  // It is offered to families setting up an adventure.
  await admin.goto(`${BASE}/campaigns/new`);
  check(
    "and it is offered when starting an adventure",
    (await admin.locator("main").innerText()).includes("The Thing In The Hedge"),
  );

  // ---- Not offering one ------------------------------------------------------
  await admin.goto(`${BASE}/settings/adventures`);
  await submitAndSettle(admin, 'button[aria-label="Stop offering The Thing In The Hedge"]');

  const hidden = await db.storyline.findFirstOrThrow({ where: { title: "The Thing In The Hedge" } });
  check("an adventure can be taken out of the list", hidden.isActive === false);

  await admin.goto(`${BASE}/campaigns/new`);
  check(
    "and then it is not offered",
    !(await admin.locator("main").innerText()).includes("The Thing In The Hedge"),
  );

  // Nothing is ever deleted, because a campaign points at its storyline.
  check(
    "there is no way to delete one",
    (await admin.goto(`${BASE}/settings/adventures`).then(async () =>
      (await admin.locator("main").innerText()).includes("Nothing is ever deleted"),
    )) === true,
  );

  // ---- Editing a shipped adventure takes it out of the seed's hands ---------
  const shipped = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-star-in-grandmas-garden" },
  });
  check("a shipped adventure starts out not custom", shipped.isCustom === false);

  await admin.goto(`${BASE}/settings/adventures/${shipped.id}`);
  const warned = await admin.locator("main").innerText();
  check("editing one warns that it stops being updated", warned.includes("makes it yours") || warned.includes("makes it yours."));

  await admin.fill('input[name="tagline"]', "Ours now.");
  await submitAndSettle(admin, 'button:has-text("Save this adventure")');

  const afterEdit = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-star-in-grandmas-garden" },
  });
  check("saving it makes it yours", afterEdit.isCustom === true);
  check("and the edit stuck", afterEdit.tagline === "Ours now.", afterEdit.tagline);

  // ---- What it has used ------------------------------------------------------
  await admin.goto(`${BASE}/settings/usage`);
  const usage = await admin.locator("main").innerText();
  check("the usage page opens", admin.url().endsWith("/usage"));
  check(
    "and says it is counting rather than costing until prices are set",
    usage.includes("counted rather than costed"),
  );

  // ---- A picture of an adventurer -------------------------------------------

  const uploaded = await adminContext.request.post(`${BASE}/api/characters/${mira.id}/portrait`, {
    multipart: { portrait: { name: "mira.png", mimeType: "image/png", buffer: PIXEL_PNG } },
  });
  check("a portrait can be uploaded", uploaded.ok(), String(uploaded.status()));

  const stored = await db.characterPortrait.findUnique({ where: { characterId: mira.id } });
  check("it is kept with the adventurer", stored !== null);
  check("as the format it actually is", stored?.mimeType === "image/png", stored?.mimeType);

  const served = await adminContext.request.get(`${BASE}/api/characters/${mira.id}/portrait`);
  check("and served back", served.ok() && (served.headers()["content-type"] ?? "").startsWith("image/"));

  // A file that is not a picture is refused whatever it claims to be.
  const lying = await adminContext.request.post(`${BASE}/api/characters/${mira.id}/portrait`, {
    multipart: {
      portrait: { name: "not.png", mimeType: "image/png", buffer: Buffer.from("#!/bin/sh\necho no") },
    },
  });
  check("something that is not a picture is refused", lying.status() === 415, String(lying.status()));

  // Another household cannot upload to somebody else's adventurer, or read it.
  const trespass = await playerContext.request.post(`${BASE}/api/characters/${mira.id}/portrait`, {
    multipart: { portrait: { name: "x.png", mimeType: "image/png", buffer: PIXEL_PNG } },
  });
  check("nobody else can change it", trespass.status() === 404, String(trespass.status()));

  const peek = await playerContext.request.get(`${BASE}/api/characters/${mira.id}/portrait`);
  check("nor see it, without sharing an adventure", peek.status() === 404, String(peek.status()));

  // Replacing it moves the version on, which is what defeats the cache.
  await adminContext.request.post(`${BASE}/api/characters/${mira.id}/portrait`, {
    multipart: { portrait: { name: "mira.png", mimeType: "image/png", buffer: PIXEL_PNG } },
  });
  const replaced = await db.characterPortrait.findUniqueOrThrow({ where: { characterId: mira.id } });
  check("replacing it changes the version", replaced.version === 2, String(replaced.version));

  const removed = await adminContext.request.delete(`${BASE}/api/characters/${mira.id}/portrait`);
  check("and it can be taken down again", removed.ok());
  check(
    "leaving nothing behind",
    (await db.characterPortrait.count({ where: { characterId: mira.id } })) === 0,
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
