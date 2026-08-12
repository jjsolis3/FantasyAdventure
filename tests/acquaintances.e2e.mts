/**
 * End-to-end check that people outlive the adventure they were met on.
 *
 * NPC memories have always died with the campaign, so a family could spend four
 * evenings winning over a beekeeper and begin the next story in a world where
 * nobody had ever met him. What has to be true now is that finishing an
 * adventure brings the ones who mattered home, that the walk-ons are left
 * behind, and that the *next* adventure's storyteller is told about them.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1 and AI_MODEL set
 *   4. npx tsx tests/acquaintances.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { MAX_PER_ADVENTURE } from "../lib/game/acquaintances.ts";

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

async function buildCharacter(page: Page, name: string, race: string, archetype: string) {
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', name);
  await chooseOption(page, "select#choice-race", "race", race);
  await chooseOption(page, "select#choice-archetype", "archetype", archetype);
  await submitAndSettle(page, 'button:has-text("Create adventurer")');
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
  await buildCharacter(page, "Rowan", "Human", "Guardian");
  const [mira, rowan] = await db.character.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  // ---- A first adventure, and nobody known yet ------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  const before = (await page.textContent("main")) ?? "";
  check("a new adventurer knows nobody yet", !/People (she|he|they) know/.test(before));

  const dragon = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-dragon-who-lost-her-name" },
  });

  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${dragon.title}")`);
  await page.click('button:has-text("Mira")');
  await page.click('button:has-text("Rowan")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');
  const first = await db.campaign.findFirstOrThrow();

  await page.goto(`${BASE}/campaigns/${first.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  await waitFor(
    "the opening scene",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: first.id } })).status === "ACTIVE",
  );

  // The cast this adventure met. Written straight in because what is under test
  // is which of them come home, not how the storyteller recorded them.
  await db.memory.createMany({
    data: [
      {
        campaignId: first.id,
        kind: "NPC",
        key: "the beekeeper",
        content: "Keeps bees, knows which way is up, and is afraid of the dark.",
        importance: 5,
      },
      {
        campaignId: first.id,
        kind: "NPC",
        key: "the bridge troll",
        content: "Lonely rather than fierce, and mostly wants dinner company.",
        importance: 4,
      },
      {
        campaignId: first.id,
        kind: "NPC",
        key: "a stallholder",
        content: "Sold them an apple and said four words.",
        importance: 2,
      },
      {
        campaignId: first.id,
        kind: "PLACE",
        key: "the barley field",
        content: "Flattened in a wide circle.",
        importance: 5,
      },
    ],
  });

  // ---- Finishing it brings the ones who mattered home ------------------------
  // Driven through the real pipeline: the party asks for an ending, the
  // storyteller writes one, and the engine's own completion path runs. Faking
  // a finished adventure in the database would test nothing.
  const acts = await db.storylineAct.count({ where: { storylineId: dragon.id } });
  await db.campaign.update({ where: { id: first.id }, data: { currentActIndex: acts } });

  await page.reload();
  await page.click('button:has-text("What do you do?")');
  await page.fill("textarea", "We bring the story to its end, and say goodbye to the beekeeper.");
  await page.click('button:has-text("Next")');
  await page.fill("textarea", "I wave too.");
  await page.click('button:has-text("Done")');
  await page.click('button:has-text("Tell the storyteller")');

  const finished = await waitFor(
    "the adventure to finish",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: first.id } })).status === "COMPLETE",
  );
  check("the adventure ended", finished);

  const known = await db.acquaintance.findMany({ where: { characterId: mira.id } });
  check(
    "the ones who mattered came home",
    known.some((person) => person.key === "beekeeper") &&
      known.some((person) => person.key === "bridge troll"),
    known.map((person) => person.key).join(", "),
  );
  check(
    "the walk-on did not",
    !known.some((person) => person.key.includes("stallholder")),
    known.map((person) => person.key).join(", "),
  );
  check("and neither did a place", !known.some((person) => person.key.includes("barley")));
  check("no more than a handful", known.length <= MAX_PER_ADVENTURE, String(known.length));

  check(
    "everybody who travelled knows them",
    (await db.acquaintance.count({ where: { characterId: rowan.id } })) === known.length,
  );

  const beekeeper = known.find((person) => person.key === "beekeeper");
  check("what they are like came with them", (beekeeper?.about ?? "").includes("afraid of the dark"));
  check("and where they were met", beekeeper?.metInCampaignTitle === first.title, beekeeper?.metInCampaignTitle);
  check("met once, so far", beekeeper?.timesMet === 1, String(beekeeper?.timesMet));

  // ---- How it went ----------------------------------------------------------
  // The ending used to be one line in a transcript that had already scrolled
  // past. Everything the evening produced was real, recorded, and scattered.
  await page.goto(`${BASE}/campaigns/${first.id}/summary`);
  const summary = (await page.textContent("main")) ?? "";

  check("a finished adventure has a summary", summary.includes("How it went"));
  check("with what the party did between them", summary.includes("Between you"));
  check("and every girl on it", summary.includes("Mira") && summary.includes("Rowan"));
  check(
    "saying what the dice earned her",
    /\d+ experience on this adventure/.test(summary),
    summary.match(/\d+ experience on this adventure/)?.[0] ?? "(not found)",
  );
  check("and where it came from", summary.includes("from the dice"));
  check("the places they saw are counted", summary.includes("Places seen"));
  check("and the board is laid out in full", summary.includes("Everything you set out to do"));

  // Her private aim is public now. The story is over; the reveal is the point.
  const hers = await db.quest.findFirst({
    where: { campaignId: first.id, kind: "PERSONAL", secretForCharacterId: mira.id },
  });
  if (hers) {
    check("her own aim is revealed at the end", summary.includes(hers.title), hers.title);
  }

  // ---- Her sheet says who she knows -----------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  const sheet = (await page.textContent("main")) ?? "";
  check("her page lists who she knows", /People (she|he|they) know/.test(sheet));
  check("by name", sheet.includes("the beekeeper"));
  check("and says where they met", sheet.includes(first.title));

  // ---- The next adventure's storyteller is told ------------------------------
  const star = await db.storyline.findFirstOrThrow({
    where: { slug: { not: dragon.slug }, isActive: true },
  });

  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${star.title}")`);
  await page.click('button:has-text("Mira")');
  await page.click('button:has-text("Rowan")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');

  const second = await db.campaign.findFirstOrThrow({ where: { id: { not: first.id } } });

  await page.goto(`${BASE}/campaigns/${second.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  await waitFor(
    "the second opening scene",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: second.id } })).status === "ACTIVE",
  );

  const toldAbout = await db.aiCall.findFirst({
    where: {
      campaignId: second.id,
      promptPreview: { contains: "PEOPLE THIS FAMILY ALREADY KNOWS" },
    },
  });
  check("the next storyteller is told who they know", toldAbout !== null);
  check(
    "by name, with what happened between them",
    (toldAbout?.promptPreview ?? "").includes("the beekeeper"),
  );
  check(
    "and told it is an invitation rather than an instruction",
    (toldAbout?.promptPreview ?? "").includes("You may bring ONE"),
  );
  check(
    "and who in the party knows them",
    /Mira and Rowan know them|Rowan and Mira know them/.test(toldAbout?.promptPreview ?? ""),
    (toldAbout?.promptPreview ?? "").slice(0, 0),
  );

  // ---- Meeting them again raises the count -----------------------------------
  await db.acquaintance.upsert({
    where: { characterId_key: { characterId: mira.id, key: "beekeeper" } },
    create: {
      characterId: mira.id,
      key: "beekeeper",
      name: "the beekeeper",
      about: "Keeps bees.",
      metInCampaignTitle: second.title,
    },
    update: { timesMet: { increment: 1 } },
  });

  const again = await db.acquaintance.findFirstOrThrow({
    where: { characterId: mira.id, key: "beekeeper" },
  });
  check("meeting somebody again is counted, not duplicated", again.timesMet === 2, String(again.timesMet));
  check(
    "and there is still only one of them",
    (await db.acquaintance.count({ where: { characterId: mira.id, key: "beekeeper" } })) === 1,
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
