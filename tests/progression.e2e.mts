/**
 * End-to-end check of M6 progression: skill growth, items, milestone
 * announcements and Family Moves.
 *
 * Usage: same as tests/play.e2e.mts — mock model on :11499, app pointed at it,
 * scratch database with no accounts.
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

async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`  (timed out waiting for ${label})`);
  return false;
}

/** Walks the ask-each-character flow and sends the turn. */
async function takeTurn(page: Page, lines: string[], pickMove?: string) {
  await page.click('button:has-text("What do you do?")');
  for (const [index, line] of lines.entries()) {
    await page.fill("textarea", line);
    await page.click(index + 1 < lines.length ? 'button:has-text("Next")' : 'button:has-text("Done")');
  }
  if (pickMove) await page.click(`button:has-text("${pickMove}")`);
  await page.click('button:has-text("Tell the storyteller")');
}


/**
 * Picks a race/calling and confirms it registered.
 *
 * These selects are controlled by React and write through to a hidden input.
 * Selecting before hydration completes silently does nothing — the change
 * event has no handler yet and React then resets the select to its own state.
 * Retrying until the hidden input agrees removes the race.
 */
async function chooseOption(page: Page, selectId: string, hiddenName: string, value: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.selectOption(selectId, value);
    const applied = await page.inputValue(`input[name="${hiddenName}"]`).catch(() => "");
    if (applied === value || (value === "__other__" && applied === "")) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`${selectId} never accepted ${value} — hydration may have failed.`);
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

  for (const [name, race, arch] of [
    ["Mira", "Halfling", "Beastfriend"],
    ["Rowan", "Human", "Guardian"],
  ] as const) {
    await page.goto(`${BASE}/characters/new`);
    await page.fill('input[name="name"]', name);
    await chooseOption(page, "select#choice-race", "race", race);
    await chooseOption(page, "select#choice-archetype", "archetype", arch);
    // Mira needs the skill the mock adjudicator will name.
    if (name === "Mira") await page.click('button:has-text("Speak with Animals")');
    await submitAndSettle(page, 'button:has-text("Create adventurer")');
  }

  const [mira, rowan] = await db.character.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

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

  // ---- No bond yet means no Family Moves ----------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  await waitFor("the opening", async () => (await db.turnEvent.count({ where: { type: "NARRATION" } })) === 1);

  await page.reload();
  await page.click('button:has-text("What do you do?")');
  await page.fill("textarea", "I look around.");
  await page.click('button:has-text("Next")');
  await page.fill("textarea", "I wait.");
  await page.click('button:has-text("Done")');
  check(
    "no Family Moves are offered at bond zero",
    (await page.locator("text=Family Moves").count()) === 0,
  );

  // ---- A turn grows skills, awards items and announces both ---------------
  await page.click('button:has-text("Tell the storyteller")');
  await waitFor(
    "the first turn",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 1,
  );

  const skill = await db.characterSkill.findFirstOrThrow({
    where: { characterId: mira.id, name: "Speak with Animals" },
  });
  check("using a skill earned it experience", skill.xp === 1, `xp=${skill.xp}`);

  const item = await db.inventoryItem.findFirst({ where: { characterId: mira.id } });
  check("an item was recorded", item?.name === "a smooth grey stone", item?.name);
  check("the item remembers which adventure it came from", item?.foundInCampaignId === campaign.id);

  const systemEvents = await db.turnEvent.findMany({ where: { type: "SYSTEM" } });
  check(
    "picking something up is announced",
    systemEvents.some((event) => /now carrying: a smooth grey stone/.test(event.content)),
    systemEvents.map((event) => event.content).join(" | "),
  );

  // ---- One place that shows everything the party has found ----------------
  //
  // Items were always being kept on whoever picked them up; what was missing
  // was somewhere to see all of them at once, which is the only way a table on
  // four separate phones can answer "do we have it?".
  await page.goto(`${BASE}/campaigns/${campaign.id}/finds`);
  const finds = await page.locator("main").innerText();
  check("the finds page lists what was picked up", finds.includes("a smooth grey stone"));
  check("and says who is carrying it", /Mira/.test(finds));

  // What the storyline asked for in the chapters reached so far, with anything
  // still missing called out.
  const seeking = await db.storylineAct.findFirst({
    where: { storyline: { campaigns: { some: { id: campaign.id } } }, index: 1 },
    select: { seeks: true },
  });
  if ((seeking?.seeks.length ?? 0) > 0) {
    check(
      "and names what this chapter is still waiting on",
      finds.includes("Quests") && finds.includes(seeking!.seeks[0]),
      seeking!.seeks.join(", "),
    );
  }

  // Back to the table, which the rest of this test is standing at.
  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);

  const afterOne = await db.relationship.findFirstOrThrow();
  check("a single helpful moment does not unlock a move", afterOne.bondLevel === 0, `xp=${afterOne.bondXp}`);

  // Bond 1 needs three moments, so helping each other has to become a habit
  // before it unlocks anything. Two more turns gets there.
  for (let turn = 2; turn <= 3; turn += 1) {
    await page.reload();
    await takeTurn(page, ["I try again.", "I help her."]);
    await waitFor(
      `turn ${turn}`,
      async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === turn,
    );
  }

  const bond = await db.relationship.findFirstOrThrow();
  check("three helpful moments reach bond level 1", bond.bondLevel === 1, `xp=${bond.bondXp} level=${bond.bondLevel}`);

  const unlockEvents = await db.turnEvent.findMany({ where: { type: "SYSTEM" } });
  check(
    "unlocking a Family Move is announced",
    unlockEvents.some((event) => /can now use Lend a Hand together/.test(event.content)),
    unlockEvents.map((event) => event.content).join(" | "),
  );

  // ---- The unlocked move is offered and works -----------------------------
  await page.reload();
  await page.click('button:has-text("What do you do?")');
  await page.fill("textarea", "I try the latch again.");
  await page.click('button:has-text("Next")');
  await page.fill("textarea", "I steady her hands.");
  await page.click('button:has-text("Done")');

  check("the unlocked move is now offered", (await page.locator("text=Family Moves").count()) === 1);
  const offered = (await page.textContent("body")) ?? "";
  check("both directions of the move are offered", /Rowan helps Mira/.test(offered) && /Mira helps Rowan/.test(offered));

  await page.click('button:has-text("Rowan helps Mira")');
  await page.click('button:has-text("Tell the storyteller")');
  await waitFor(
    "the move turn",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 4,
  );

  const uses = await db.familyMoveUse.findMany();
  check("the move was recorded as spent", uses.length === 1, String(uses.length));
  check("it recorded which move", uses[0]?.moveKey === "lend_a_hand", uses[0]?.moveKey);

  const movedRoll = await db.turnEvent.findFirst({
    where: { type: "DICE_ROLL" },
    orderBy: { createdAt: "desc" },
  });
  const meta = movedRoll?.metadata as Record<string, unknown>;
  check("the roll records the move that altered it", typeof meta.move === "object" && meta.move !== null);
  check(
    "the move's effect is described on the roll",
    /lends a hand/i.test(JSON.stringify(meta.move ?? "")),
    JSON.stringify(meta.move ?? ""),
  );

  // ---- Once per scene -----------------------------------------------------
  await page.reload();
  const afterUse = (await page.textContent("body")) ?? "";
  check("a spent move is no longer offered this scene", !/Rowan helps Mira/.test(afterUse));

  // Even posted directly, it must not apply twice.
  const before = await db.familyMoveUse.count();
  await page.evaluate(
    async ({ campaignId, helperId, targetId }) => {
      await fetch(`/api/campaigns/${campaignId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "turn",
          actions: [{ characterId: targetId, text: "I try once more." }],
          familyMove: { key: "lend_a_hand", helperId, targetId },
        }),
      });
    },
    { campaignId: campaign.id, helperId: rowan.id, targetId: mira.id },
  );
  await waitFor(
    "the direct turn",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 5,
  );
  check("a spent move cannot be used twice in a scene", (await db.familyMoveUse.count()) === before);

  // ---- A move above the bond level is refused -----------------------------
  const beforeLocked = await db.familyMoveUse.count();
  await page.evaluate(
    async ({ campaignId, helperId, targetId }) => {
      await fetch(`/api/campaigns/${campaignId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "turn",
          actions: [{ characterId: targetId, text: "I try again." }],
          // Requires bond 5; this pair is at 1.
          familyMove: { key: "hearthlight", helperId, targetId },
        }),
      });
    },
    { campaignId: campaign.id, helperId: rowan.id, targetId: mira.id },
  );
  await waitFor(
    "the locked-move turn",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 6,
  );
  check("a move above the bond level is refused", (await db.familyMoveUse.count()) === beforeLocked);

  // ---- Progression is visible ---------------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  const sheet = (await page.textContent("body")) ?? "";
  check("the character sheet shows skill rank", /Speak with Animals/.test(sheet) && /rank \d/.test(sheet));
  check("the character sheet shows what they carry", /a smooth grey stone/.test(sheet));

  await page.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
