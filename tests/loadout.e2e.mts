/**
 * End-to-end check of packing before you set out.
 *
 * The payoff worth proving is the one that needed no new machinery: a thing you
 * brought from home lands in your pockets tagged to this adventure, so the
 * quest board reads it exactly like something found in the story. "We brought
 * the rope!" has to actually finish a quest, or packing is decoration.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1 and AI_MODEL set
 *   4. npx tsx tests/loadout.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { buildCharacter } from "./e2e-helpers.mts";
import { SUPPLIES_PER_CHARACTER, suppliesFor } from "../lib/game/loadout.ts";

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

async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 60_000) {
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


/** Clicks a supply by its own label, the way a child would. */
async function pack(page: Page, supplyName: string) {
  await page.click(`button:has-text("${supplyName}")`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
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

  await buildCharacter(page, "Mira", "Halfling", "Beastfriend");
  await buildCharacter(page, "Rowan", "Human", "Maker");
  const [mira, rowan] = await db.character.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const dragon = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-dragon-who-lost-her-name" },
  });

  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${dragon.title}")`);
  await page.click('button:has-text("Mira")');
  await page.click('button:has-text("Rowan")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');
  const campaign = await db.campaign.findFirstOrThrow();

  // ---- The packing screen ---------------------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}`);
  const setup = (await page.textContent("main")) ?? "";
  check("packing is offered before setting out", setup.includes("What are you bringing?"));

  // What each of them is offered differs by calling, which is the point of it.
  const forMira = suppliesFor("Beastfriend", campaign.tone);
  const forRowan = suppliesFor("Maker", campaign.tone);
  check("her calling suggests things of its own", setup.includes(forMira[0].name), forMira[0].name);
  check("and so does his", setup.includes(forRowan[0].name), forRowan[0].name);
  check("everybody is offered the rope", setup.includes("a coil of rope"));

  // ---- Packing, and changing your mind --------------------------------------
  await pack(page, forMira[0].name);
  const packedOne = await waitFor(
    "the first thing to go in the pack",
    async () =>
      (await db.inventoryItem.count({
        where: { characterId: mira.id, brought: true, foundInCampaignId: campaign.id },
      })) === 1,
    15_000,
  );
  check("a thing can be packed", packedOne);

  const first = await db.inventoryItem.findFirstOrThrow({
    where: { characterId: mira.id, brought: true },
  });
  check("it is tagged to this adventure", first.foundInCampaignId === campaign.id);
  check("and marked as brought rather than found", first.brought === true);
  check("and it carries what it is for", (first.description ?? "").length > 10, first.description ?? "");

  // Putting it back, because a decision you cannot undo is not a decision.
  await pack(page, forMira[0].name);
  const putBack = await waitFor(
    "it to be put back",
    async () => (await db.inventoryItem.count({ where: { characterId: mira.id } })) === 0,
    15_000,
  );
  check("and taken out again", putBack);

  // ---- Something she already owns -------------------------------------------
  // Inventory survives an adventure, so by the second story she really does own
  // a lantern and the list offers her one anyway. Packing it used to bump the
  // row's quantity and nothing else, leaving an item the screen did not count
  // as packed, could not put back, and would take a second copy of every time
  // it was pressed.
  await db.inventoryItem.create({
    data: {
      characterId: mira.id,
      name: forMira[0].name,
      description: forMira[0].description,
      // Carried home from some earlier story, not this one.
      foundInCampaignId: null,
      brought: false,
    },
  });

  await page.reload();
  const setupWithOwned = await page.textContent("body");
  check(
    "a thing she already owns is not offered again",
    setupWithOwned?.includes("Already yours — it comes with you.") === true,
  );

  // The form is gone, so the only way to press it is to ask the server directly
  // — which is where the guard has to hold anyway.
  check(
    "and there is no button left to press",
    (await page.locator(`form button:has-text("${forMira[0].name}")`).count()) === 0,
  );

  await db.inventoryItem.deleteMany({ where: { characterId: mira.id } });
  await page.reload();

  // ---- The cap --------------------------------------------------------------
  await pack(page, forMira[0].name);
  await pack(page, forMira[1].name);
  await waitFor(
    "the pack to fill",
    async () =>
      (await db.inventoryItem.count({ where: { characterId: mira.id, brought: true } })) ===
      SUPPLIES_PER_CHARACTER,
    15_000,
  );

  // The rest are disabled rather than hidden, so the choice stays visible.
  const rope = page.locator('button:has-text("a coil of rope")').first();
  check("a full pack cannot take more", await rope.isDisabled());
  check(
    "and holds exactly what it should",
    (await db.inventoryItem.count({ where: { characterId: mira.id, brought: true } })) ===
      SUPPLIES_PER_CHARACTER,
  );

  // ---- The payoff: something you brought finishes a quest --------------------
  // The chapter asks for one thing by name. Packing it is a perfectly good way
  // to have it, and needs no code of its own — the board reads pockets.
  const firstAct = await db.storylineAct.findFirstOrThrow({
    where: { storylineId: dragon.id, index: 1 },
  });
  check("the chapter asks for something", firstAct.seeks.length > 0, firstAct.seeks.join(", "));

  // Rowan packs it. Written straight in because the offered list is deliberately
  // generic — no storyline's sought item is on it, and it should not be.
  await db.inventoryItem.create({
    data: {
      characterId: rowan.id,
      name: `${firstAct.seeks[0]}, wrapped in a cloth`,
      description: "packed before setting out",
      foundInCampaignId: campaign.id,
      brought: true,
    },
  });

  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  const begun = await waitFor(
    "the opening scene",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "ACTIVE",
  );
  check("the adventure begins", begun);

  await page.reload();
  await page.click('button:has-text("What do you do?")');
  await page.fill("textarea", "I hold it up so everyone can see.");
  await page.click('button:has-text("Next")');
  await page.fill("textarea", "I unwrap the thing I brought.");
  await page.click('button:has-text("Done")');
  await page.click('button:has-text("Tell the storyteller")');

  const turnDone = await waitFor(
    "the turn to commit",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 1,
  );
  check("the turn completed", turnDone);

  const chapterQuest = await db.quest.findFirstOrThrow({
    where: { campaignId: campaign.id, kind: "MAIN", actIndex: 1 },
    include: { objectives: true },
  });
  check(
    "something brought from home satisfies the chapter",
    chapterQuest.objectives[0]?.doneAtTurn === 1,
  );
  check("credited to whoever packed it", chapterQuest.objectives[0]?.foundByCharacterId === rowan.id);
  check("and the quest is finished by it", chapterQuest.status === "COMPLETE", chapterQuest.status);

  // ---- Packing closes once the story starts ---------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}`);
  const afterStart = (await page.textContent("main")) ?? "";
  check("packing is over once the story has begun", !afterStart.includes("What are you bringing?"));

  // ---- The journal tells the two apart --------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/journal`);
  const journal = (await page.textContent("main")) ?? "";
  check("the journal says what she set out with", journal.includes("Set out with"));
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
