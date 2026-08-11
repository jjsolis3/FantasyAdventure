/**
 * End-to-end check of the quest board.
 *
 * The interesting moment is the one a list on a page could never have: the
 * party turns up the thing a chapter was asking for, the quest *finishes*, the
 * item is spent to finish it, and everybody is told who handed it over. Before
 * quests, finding it changed nothing and said nothing.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1 and AI_MODEL set
 *   4. npx tsx tests/quests.e2e.mts
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

  // This storyline's first chapter asks for one thing by name, which is what
  // makes it the right one to test a quest against.
  const dragon = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-dragon-who-lost-her-name" },
  });
  const firstAct = await db.storylineAct.findFirstOrThrow({
    where: { storylineId: dragon.id, index: 1 },
  });
  check("the chapter under test asks for something", firstAct.seeks.length > 0, firstAct.seeks.join(", "));

  await page.goto(`${BASE}/campaigns/new`);
  await page.click(`button:has-text("${dragon.title}")`);
  await page.click('button:has-text("Mira")');
  await page.click('button:has-text("Rowan")');
  await submitAndSettle(page, 'button:has-text("Begin the preparations")');
  const campaign = await db.campaign.findFirstOrThrow();

  // ---- The chapter opens its quest ----------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  const begun = await waitFor(
    "the opening scene",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "ACTIVE",
  );
  check("the adventure begins", begun);

  const quest = await db.quest.findFirstOrThrow({
    where: { campaignId: campaign.id },
    include: { objectives: { orderBy: { position: "asc" } } },
  });
  check("the first chapter opened a quest", quest.actIndex === 1 && quest.kind === "MAIN");
  check("named after the chapter", quest.title === firstAct.title, quest.title);
  check(
    "asking for what the chapter asks for",
    quest.objectives.length === firstAct.seeks.length &&
      quest.objectives[0].text === firstAct.seeks[0],
    quest.objectives.map((objective) => objective.text).join(", "),
  );
  check("and nothing is done yet", quest.objectives.every((objective) => objective.doneAtTurn === null));

  // A later chapter's quest is a spoiler and must not exist yet. Counted by
  // chapter rather than in total, because personal quests legitimately open
  // alongside this one.
  check(
    "later chapters keep their secrets",
    (await db.quest.count({
      where: { campaignId: campaign.id, kind: "MAIN", actIndex: { gt: 1 } },
    })) === 0,
  );

  // ---- Somebody turns up the thing ----------------------------------------
  // Written straight in, the way the storyteller would have handed it over on
  // an earlier turn. What matters here is that the quest notices by looking in
  // people's pockets rather than by being told.
  // Not the words the chapter used — that is the whole point. The chapter says
  // "a scale she shed when she landed"; a child comes back with this.
  const foundName = `a bright ${firstAct.seeks[0]}, still warm`;
  await db.inventoryItem.create({
    data: {
      characterId: mira.id,
      name: foundName,
      description: "warm to the touch",
      foundInCampaignId: campaign.id,
    },
  });

  const beforeXp = (await db.character.findUniqueOrThrow({ where: { id: rowan.id } })).xp;

  // ---- One ordinary turn --------------------------------------------------
  await page.reload();
  await page.click('button:has-text("What do you do?")');
  await page.fill("textarea", "I hold it up so everyone can see.");
  await page.click('button:has-text("Next")');
  await page.fill("textarea", "I keep watch while she does.");
  await page.click('button:has-text("Done")');
  await page.click('button:has-text("Tell the storyteller")');

  const turnDone = await waitFor(
    "the turn to commit",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 1,
  );
  check("the turn completed", turnDone);

  // ---- What finishing a quest does ----------------------------------------
  const after = await db.quest.findUniqueOrThrow({
    where: { id: quest.id },
    include: { objectives: true },
  });

  check("the quest is finished", after.status === "COMPLETE", after.status);
  check("it records which turn finished it", after.completedAtTurn === 1, String(after.completedAtTurn));

  const objective = after.objectives[0];
  check("the objective is ticked off", objective.doneAtTurn === 1);
  check(
    "under the name it was actually found by",
    objective.itemName === foundName,
    objective.itemName ?? "(none)",
  );
  check("and credited to whoever was carrying it", objective.foundByCharacterId === mira.id);
  check("and marked as spent", objective.consumed === true);

  const stillCarried = await db.inventoryItem.findFirst({
    where: { characterId: mira.id, name: foundName },
  });
  check("the item has left the pack", stillCarried === null);

  const keepsake = await db.keepsake.findFirst({ where: { characterId: mira.id } });
  check("but not the story", keepsake?.name === foundName, keepsake?.name ?? "(none)");
  check(
    "and it says what it bought",
    keepsake?.note.includes(quest.title) === true,
    keepsake?.note ?? "(none)",
  );

  const rowanAfter = await db.character.findUniqueOrThrow({ where: { id: rowan.id } });
  check(
    "everyone is paid for finishing it, not only the finder",
    rowanAfter.xp === beforeXp + 8,
    `${beforeXp} -> ${rowanAfter.xp}`,
  );

  const announcements = await db.turnEvent.findMany({ where: { type: "SYSTEM" } });
  const said = announcements.map((event) => event.content).join(" | ");
  check("the table is told the quest is done", said.includes(`${quest.title} — done`), said);
  check("and who gave up what", said.includes("Mira gave up"), said);

  // ---- The board ------------------------------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/finds`);
  const board = (await page.textContent("main")) ?? "";
  check("the board shows the quest as done", board.includes(quest.title) && board.includes("done"));
  check("and what was given up", board.includes("Given up") && board.includes(foundName));

  // ---- Handing something over ----------------------------------------------
  // The turn itself handed Mira a stone, which is the thing left to move.
  const stone = await db.inventoryItem.findFirstOrThrow({ where: { characterId: mira.id } });

  await page.selectOption(`select[aria-label="Give ${stone.name} to"]`, rowan.id);
  await submitAndSettle(page, `button[aria-label="Hand over ${stone.name}"]`);

  const moved = await waitFor(
    "the item to change hands",
    async () =>
      (await db.inventoryItem.count({ where: { characterId: rowan.id, name: stone.name } })) === 1,
    15_000,
  );
  check("an item can be handed to somebody else", moved);
  check(
    "and is no longer with the one who found it",
    (await db.inventoryItem.count({ where: { characterId: mira.id, name: stone.name } })) === 0,
  );
  check(
    "keeping the adventure it was found on, so it still counts toward quests",
    (
      await db.inventoryItem.findFirstOrThrow({
        where: { characterId: rowan.id, name: stone.name },
      })
    ).foundInCampaignId === campaign.id,
  );

  // ---- The shelf ------------------------------------------------------------
  // The record of what she has done, on her own page, named by the adventure it
  // happened on rather than as a loose pile.
  await page.goto(`${BASE}/characters/${mira.id}`);
  const sheet = (await page.textContent("main")) ?? "";
  check("her page has a shelf", sheet.includes("The shelf"));
  check("with what she gave up on it", sheet.includes(foundName));
  check("and what it bought", sheet.includes(quest.title));
  check(
    "filed under the adventure it happened on",
    sheet.includes(campaign.title),
    campaign.title,
  );

  // ---- Where they went ------------------------------------------------------
  await page.goto(`${BASE}/campaigns/${campaign.id}/journal`);
  const journal = (await page.textContent("main")) ?? "";
  const scenes = await db.scene.findMany({ where: { campaignId: campaign.id } });
  const placed = scenes.find((scene) => scene.location !== null);

  check("the journal draws the route", journal.includes("Where they went"));
  if (placed?.location) {
    check("naming where they have been", journal.includes(placed.location), placed.location);
  }

  // ---- Taking the turn back -------------------------------------------------
  // A quest that finished on a turn the table takes back must un-finish, or the
  // item is gone and the quest is done and nothing can put either right.
  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Take back the last turn")');
  await page.click('button:has-text("Yes, take it back")');

  const undone = await waitFor(
    "the turn to be taken back",
    async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 0,
    20_000,
  );
  check("the turn was taken back", undone);
  check(
    "the quest is open again",
    (await db.quest.findUniqueOrThrow({ where: { id: quest.id } })).status === "ACTIVE",
  );
  check(
    "the spent item is back in the pack",
    (await db.inventoryItem.count({ where: { characterId: mira.id, name: foundName } })) === 1,
  );
  check("and the keepsake is gone", (await db.keepsake.count()) === 0);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
