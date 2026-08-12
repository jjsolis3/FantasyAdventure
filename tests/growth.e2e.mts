/**
 * End-to-end check that a character stops being static.
 *
 * Three things had to become true, and none of them was before:
 *   - experience buys something visible she chooses where to put,
 *   - a thing she keeps trying becomes a thing she is good at,
 *   - and taking the turn back takes all of it back with her.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1 and AI_MODEL set
 *   4. npx tsx tests/growth.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { ATTEMPTS_TO_LEARN } from "../lib/game/practice.ts";
import { STAT_CEILING, statModifier } from "../lib/game/rules.ts";
import { signatureFor } from "../lib/game/character-options.ts";

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

async function takeTurn(page: Page, campaignId: string, said: string[], expected: number) {
  await page.goto(`${BASE}/campaigns/${campaignId}/play`);
  await page.click('button:has-text("What do you do?")');
  for (let index = 0; index < said.length; index += 1) {
    await page.fill("textarea", said[index]);
    await page.click(index === said.length - 1 ? 'button:has-text("Done")' : 'button:has-text("Next")');
  }
  await page.click('button:has-text("Tell the storyteller")');

  return waitFor(
    `turn ${expected} to commit`,
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).turnCounter === expected,
  );
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

  // ---- The sheet talks about her the way her player asked ------------------
  // Pronouns were always stored and always reached the storyteller, so the
  // story got them right while the headings said "she" regardless.
  await db.character.update({
    where: { id: rowan.id },
    data: { pronouns: "he/him", gender: "Male" },
  });

  await page.goto(`${BASE}/characters/${rowan.id}`);
  const his = (await page.textContent("main")) ?? "";
  check("a he/him character is not called she", !his.includes("What she is like"), "What she is like");
  check("and is described correctly", his.includes("What he is like"));
  check("including the housekeeping", his.includes("Change his details"));

  await db.character.update({
    where: { id: rowan.id },
    data: { pronouns: "they/them" },
  });
  await page.goto(`${BASE}/characters/${rowan.id}`);
  const theirs = (await page.textContent("main")) ?? "";
  check("they/them reads as a plural, not as broken English", theirs.includes("What they are like"));

  await db.character.update({ where: { id: rowan.id }, data: { pronouns: "he/him" } });

  // ---- The sheet says what she is like --------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  const fresh = (await page.textContent("main")) ?? "";
  check("a new adventurer has nothing to spend yet", !fresh.includes("points to spend"));
  check("her calling gives her something only she can do", fresh.includes(signatureFor("Beastfriend")!.name));
  check("and says so", fresh.includes("Beastfriend only"));

  const guardianOnly = signatureFor("Guardian")!.name;
  check("which is not the same as somebody else's", !fresh.includes(guardianOnly), guardianOnly);

  // ---- Growth is spendable, and hers to place -------------------------------
  // Experience is written straight in rather than ground out over twenty turns;
  // what is under test is what a point *does*, not how slowly it arrives.
  await db.character.update({ where: { id: mira.id }, data: { xp: 30, level: 3 } });

  await page.goto(`${BASE}/characters/${mira.id}`);
  const grown = (await page.textContent("main")) ?? "";
  check("thirty experience is three points", grown.includes("3 points to spend"), grown.slice(0, 0));
  check("the sheet shows what a stat is worth on the dice", grown.includes("to rolls"));

  await page.click('button[aria-label="Put a point into Heart"]');
  await waitFor(
    "the point to land",
    async () => (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).heart === 4,
    15_000,
  );

  const raised = await db.character.findUniqueOrThrow({ where: { id: mira.id } });
  check("a point can be put where she wants it", raised.heart === 4, String(raised.heart));
  check("and the others are untouched", raised.might === 3 && raised.wits === 3 && raised.spark === 3);

  await page.goto(`${BASE}/characters/${mira.id}`);
  const afterSpend = (await page.textContent("main")) ?? "";
  check("and the ones left over are counted down", afterSpend.includes("2 points to spend"));

  // The ceiling holds even with points in hand.
  await db.character.update({
    where: { id: mira.id },
    data: { xp: 1000, heart: STAT_CEILING },
  });
  await page.goto(`${BASE}/characters/${mira.id}`);
  const maxed = (await page.textContent("main")) ?? "";
  check(
    "a stat at the ceiling stops offering to grow",
    (await page.locator('button[aria-label="Put a point into Heart"]').count()) === 0,
  );
  check(
    "and shows the flattened value rather than a runaway one",
    maxed.includes(`+${statModifier(STAT_CEILING)} to rolls`),
    `+${statModifier(STAT_CEILING)}`,
  );

  // Put her back to something ordinary before playing.
  await db.character.update({ where: { id: mira.id }, data: { xp: 0, level: 1, heart: 3 } });

  // ---- Practice becomes a skill ---------------------------------------------
  const dragon = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-dragon-who-lost-her-name" },
  });

  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${dragon.title}")`);
  await page.click('button:has-text("Mira")');
  await page.click('button:has-text("Rowan")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');
  const campaign = await db.campaign.findFirstOrThrow();

  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  await waitFor(
    "the opening scene",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "ACTIVE",
  );

  const before = await db.characterSkill.count({ where: { characterId: mira.id } });

  // The mock names the same practice every turn, which is exactly what a real
  // storyteller does when a child keeps trying the same kind of thing.
  for (let turn = 1; turn <= ATTEMPTS_TO_LEARN; turn += 1) {
    const done = await takeTurn(page, campaign.id, ["I hum to it again.", "I keep watch."], turn);
    if (!done) break;

    const practice = await db.practice.findFirst({ where: { characterId: mira.id } });
    if (turn < ATTEMPTS_TO_LEARN) {
      check(`try ${turn} is counted`, practice?.attempts === turn, String(practice?.attempts));
    }
  }

  const practice = await db.practice.findFirstOrThrow({ where: { characterId: mira.id } });
  check("what she keeps doing is on the ledger", practice.attempts === ATTEMPTS_TO_LEARN, String(practice.attempts));
  check("and it is marked as having become something", practice.learnedAtTurn !== null);

  const skills = await db.characterSkill.findMany({ where: { characterId: mira.id } });
  check(
    "four tries made a skill she did not build with",
    skills.length === before + 1,
    `${before} -> ${skills.length}`,
  );

  const learned = skills.find((skill) => skill.name.toLocaleLowerCase() === "humming");
  check("named after the thing she was doing", learned !== undefined, skills.map((s) => s.name).join(", "));
  check("and it starts at the bottom", learned?.rank === 1);

  const said = (await db.turnEvent.findMany({ where: { type: "SYSTEM" } }))
    .map((event) => event.content)
    .join(" | ");
  check("the table is told she has got good at it", said.includes("properly good at it"), said.slice(-200));

  // Rowan did not attempt it, so nothing of his changed.
  check(
    "somebody who never tried it learns nothing",
    (await db.practice.count({ where: { characterId: rowan.id } })) === 0,
  );

  // ---- Taking the turn back takes the skill with it -------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Take back the last turn")');
  await page.click('button:has-text("Yes, take it back")');

  const undone = await waitFor(
    "the turn to be taken back",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter ===
      ATTEMPTS_TO_LEARN - 1,
    20_000,
  );
  check("the turn was taken back", undone);
  check(
    "the skill it granted is gone again",
    (await db.characterSkill.count({ where: { characterId: mira.id } })) === before,
  );
  check(
    "and the ledger is back to three tries",
    (await db.practice.findFirstOrThrow({ where: { characterId: mira.id } })).attempts ===
      ATTEMPTS_TO_LEARN - 1,
  );

  // ---- Something she has not grown into yet ---------------------------------
  await db.inventoryItem.create({
    data: {
      characterId: rowan.id,
      name: "a silver flute",
      description: "cool to the touch, and far too fine for a barley field",
      foundInCampaignId: campaign.id,
      requiresSkill: "Small Wonders",
      requiresRank: 2,
    },
  });

  await page.goto(`${BASE}/characters/${rowan.id}`);
  const withFlute = (await page.textContent("main")) ?? "";
  check("a thing beyond her still sits in the pack", withFlute.includes("a silver flute"));
  check("and says it cannot be used yet", withFlute.includes("cannot use this yet"));
  check("and says exactly what would change that", withFlute.includes("Small Wonders rank 2"));

  // ---- A rank is something she can do ---------------------------------------
  await db.characterSkill.updateMany({
    where: { characterId: rowan.id },
    data: { rank: 2 },
  });
  await db.characterSkill.upsert({
    where: { characterId_name: { characterId: rowan.id, name: "Hold Fast" } },
    create: { characterId: rowan.id, name: "Hold Fast", rank: 3, xp: 20 },
    update: { rank: 3 },
  });

  await page.goto(`${BASE}/characters/${rowan.id}`);
  const withRanks = (await page.textContent("main")) ?? "";
  check("a rank past the first buys something she can do", withRanks.includes("Steady Hand"));
  check("and the next one buys another", withRanks.includes("Show Someone How"));
  check(
    "named for the skill it belongs to",
    withRanks.includes("Hold Fast without rolling") || withRanks.includes("with Hold Fast"),
    "the ability reads as being about that skill",
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
