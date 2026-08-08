/**
 * End-to-end check of the storyteller settings page.
 *
 * Usage: mock model on :11499, app pointed anywhere, scratch database with no
 * accounts. The point is that settings saved here take over from the
 * environment, so the app is deliberately started with a *wrong* AI_BASE_URL.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3399";
const MOCK = process.env.E2E_MOCK_URL ?? "http://127.0.0.1:11499/v1";
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
  await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`  (timed out waiting for ${label})`);
  return false;
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

  // ---- Admin only ---------------------------------------------------------
  {
    const invite = await db.inviteCode.create({ data: { code: "HEARTH-TEST-5555" } });
    const player = await (await browser.newContext()).newPage();
    await player.goto(`${BASE}/register`);
    await player.fill('input[name="inviteCode"]', invite.code);
    await player.fill('input[name="displayName"]', "Player");
    await player.fill('input[name="email"]', "player@example.com");
    await player.fill('input[name="password"]', "another long password");
    await submitAndSettle(player);
    await player.waitForURL(`${BASE}/`);

    await player.goto(`${BASE}/settings/storyteller`);
    check("a non-admin is sent away from settings", !player.url().includes("/settings"), player.url());

    // And cannot drive the test endpoint directly.
    const status = await player.evaluate(async () => {
      const reply = await fetch("/api/settings/storyteller/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deep: false }),
      });
      return reply.status;
    });
    check("a non-admin cannot run the connection test", status !== 200, String(status));
    await player.close();
  }

  // ---- The page shows the environment fallback ----------------------------
  await page.goto(`${BASE}/settings/storyteller`);
  const before = (await page.textContent("body")) ?? "";
  check("settings page reachable by an admin", page.url().includes("/settings/storyteller"));
  check("it explains that nothing is saved yet", /Nothing saved here yet|Nothing is configured yet/.test(before));

  // ---- Saving takes over from the environment -----------------------------
  await page.fill('input[name="baseUrl"]', MOCK);
  await page.fill('input[name="model"]', "mock-model");
  await submitAndSettle(page, 'button:has-text("Save settings")');

  const saved = await db.aiSetting.findUnique({ where: { id: "singleton" } });
  check("settings were saved", saved !== null);
  check("the address was stored", saved?.baseUrl === MOCK, saved?.baseUrl);
  check("the model was stored", saved?.model === "mock-model", saved?.model);
  check("no key was stored when none was given", saved?.apiKeyCipher === null);

  // ---- The quick check reaches the mock -----------------------------------
  await page.click('button:has-text("Quick check")');
  await page.waitForSelector("text=/answered in/", { timeout: 30_000 });
  check("the quick check reports a reply", /answered in \d+ms/.test((await page.textContent("body")) ?? ""));

  await waitFor("the test result to be recorded", async () => {
    const row = await db.aiSetting.findUnique({ where: { id: "singleton" } });
    return row?.lastTestOk === true;
  });
  check("the result was recorded", (await db.aiSetting.findUniqueOrThrow({ where: { id: "singleton" } })).lastTestOk === true);

  // ---- A broken narration model must fail the quick check -----------------
  //
  // The regression this pins: the check used to greet only the main model, so
  // a configuration whose narration model could not load reported success and
  // then died mid-turn, naming a model the test had never touched.
  await page.fill('input[name="narrationModel"]', "model-that-cannot-load");
  await submitAndSettle(page, 'button:has-text("Save settings")');

  await page.click('button:has-text("Quick check")');
  await page.waitForSelector("text=/failed —/", { timeout: 30_000 });
  const withBadNarration = (await page.textContent("body")) ?? "";
  check(
    "the quick check names the narration model that failed",
    /model-that-cannot-load/.test(withBadNarration),
  );
  check(
    "the quick check still reports the working main model",
    /mock-model/.test(withBadNarration),
  );

  await waitFor("the failure to be recorded", async () => {
    const row = await db.aiSetting.findUnique({ where: { id: "singleton" } });
    return row?.lastTestOk === false;
  });

  // Put it back so the practice turn below runs against a working pair.
  await page.fill('input[name="narrationModel"]', "");
  await submitAndSettle(page, 'button:has-text("Save settings")');

  // ---- The practice turn runs the whole pipeline --------------------------
  await page.click('button:has-text("Run a practice turn")');
  await page.waitForSelector("text=/What it wrote/", { timeout: 90_000 });
  const afterDeep = (await page.textContent("body")) ?? "";
  check("the practice turn shows the dice it asked for", /Dice it asked for/.test(afterDeep));
  check("the practice turn shows the narration", /What it wrote \(\d+ words\)/.test(afterDeep));
  check(
    "the practice turn gives a verdict",
    /no problems|Worth knowing before you play/.test(afterDeep),
  );

  // The practice turn must not write anything into a real adventure.
  check("the practice turn created no campaign", (await db.campaign.count()) === 0);
  check("the practice turn created no scenes", (await db.scene.count()) === 0);

  // ---- An API key is stored encrypted, and never returned -----------------
  await page.goto(`${BASE}/settings/storyteller`);
  await page.fill('input[name="apiKey"]', "sk-test-secret-value-12345");
  await submitAndSettle(page, 'button:has-text("Save settings")');

  const withKey = await db.aiSetting.findUniqueOrThrow({ where: { id: "singleton" } });
  check("a key was stored", withKey.apiKeyCipher !== null);
  check(
    "it is not stored in the clear",
    !(withKey.apiKeyCipher ?? "").includes("sk-test-secret-value-12345"),
  );
  check("a hint was stored instead", (withKey.apiKeyHint ?? "").includes("…"), withKey.apiKeyHint ?? "");

  await page.goto(`${BASE}/settings/storyteller`);
  const withKeyPage = await page.content();
  check("the key is never sent back to the page", !withKeyPage.includes("sk-test-secret-value-12345"));
  check("the page shows the hint", withKeyPage.includes(withKey.apiKeyHint ?? "@@@"));

  // ---- Leaving the field blank keeps the existing key ---------------------
  await page.fill('input[name="model"]', "mock-model-2");
  await submitAndSettle(page, 'button:has-text("Save settings")');
  const kept = await db.aiSetting.findUniqueOrThrow({ where: { id: "singleton" } });
  check("a blank key field leaves the stored key alone", kept.apiKeyCipher === withKey.apiKeyCipher);
  check("other changes still applied", kept.model === "mock-model-2", kept.model);

  // ---- Removing the key ---------------------------------------------------
  await page.goto(`${BASE}/settings/storyteller`);
  await page.check('input[name="clearApiKey"]');
  await submitAndSettle(page, 'button:has-text("Save settings")');
  const cleared = await db.aiSetting.findUniqueOrThrow({ where: { id: "singleton" } });
  check("the key can be removed", cleared.apiKeyCipher === null && cleared.apiKeyHint === null);

  // ---- Validation ----------------------------------------------------------
  await page.goto(`${BASE}/settings/storyteller`);
  await page.fill('input[name="baseUrl"]', "not-a-url");
  await submitAndSettle(page, 'button:has-text("Save settings")');
  check(
    "an address without a scheme is refused",
    /must start with http/i.test((await page.textContent("body")) ?? ""),
  );
  check(
    "the bad address was not saved",
    (await db.aiSetting.findUniqueOrThrow({ where: { id: "singleton" } })).baseUrl !== "not-a-url",
  );

  await page.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
