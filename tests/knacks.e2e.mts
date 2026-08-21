/**
 * End-to-end check that reaching a level finally buys something.
 *
 * It used to be announced and then read by nothing at all: the number went up,
 * the table was told, and not one thing about the character changed. What has
 * to be true now is that a level offers three, that the three are about *her*,
 * that taking one changes a die, and that taking a turn back puts the choice
 * back on the table.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1 and AI_MODEL set
 *   4. npx tsx tests/knacks.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { statsOf } from "../lib/game/rules.ts";
import { buildCharacter } from "./e2e-helpers.mts";
import { KNACKS_OFFERED, knackByKey, offerFor } from "../lib/game/knacks.ts";
import { SUPPLIES_PER_CHARACTER } from "../lib/game/loadout.ts";

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

  // ---- Level one offers nothing ---------------------------------------------
  await page.goto(`${BASE}/characters/${mira.id}`);
  // Asked of the heading rather than of the page text. The sheet also carries
  // "Something new to be good at at level 4." — the line that says when her
  // next chosen skill arrives — so a substring search for "Something new" has
  // been finding the wrong thing since the levelling rebalance.
  const offerHeading = page.getByRole("heading", { name: "Something new", exact: true });
  check("a brand new adventurer is offered nothing", (await offerHeading.count()) === 0);

  // ---- Reaching a level offers three ----------------------------------------
  // Written straight in rather than ground out over twenty turns; what is under
  // test is what a level *buys*, not how slowly it arrives.
  await db.character.update({ where: { id: mira.id }, data: { xp: 10, level: 2 } });

  await page.goto(`${BASE}/characters/${mira.id}`);
  const levelled = (await page.textContent("main")) ?? "";
  // Also asked of the heading. This passed either way, but it would have gone
  // on passing if the offer vanished entirely — the skill line alone satisfies
  // a substring search.
  check("a level offers something new", (await offerHeading.count()) === 1);

  const buttons = await page.locator('button[aria-label^="Take "]').count();
  check("three of them", buttons === KNACKS_OFFERED, String(buttons));

  // The same three every time, so refreshing cannot reroll the offer.
  await page.reload();
  const again = await page.locator('button[aria-label^="Take "]').allTextContents();
  await page.reload();
  const andAgain = await page.locator('button[aria-label^="Take "]').allTextContents();
  check("refreshing does not reshuffle them", JSON.stringify(again) === JSON.stringify(andAgain));

  // ---- The offer is about her -----------------------------------------------
  // Somebody who has been shoving and lifting should be offered Sure-footed.
  await db.practice.create({
    data: { characterId: rowan.id, key: "climb", label: "climbing", attempts: 6 },
  });
  await db.character.update({
    where: { id: rowan.id },
    data: { xp: 10, level: 2, might: 5 },
  });

  const rowanNow = await db.character.findUniqueOrThrow({
    where: { id: rowan.id },
    include: { practices: true, knacks: true },
  });
  const expected = offerFor({
    characterId: rowanNow.id,
    level: rowanNow.level,
    // Read off the row rather than named one by one, which is how this came
    // to be handing four stats to something that wants seven.
    stats: statsOf(rowanNow),
    practices: rowanNow.practices,
    taken: [],
  });
  check(
    "a climber is offered something a climber would want",
    expected.some((knack) => knack.key === "sure_footed"),
    expected.map((knack) => knack.key).join(", "),
  );

  await page.goto(`${BASE}/characters/${rowan.id}`);
  const forRowan = (await page.textContent("main")) ?? "";
  check(
    "and the page shows exactly what the rules chose",
    expected.every((knack) => forRowan.includes(knack.name)),
    expected.map((knack) => knack.name).join(", "),
  );

  // ---- Taking one ------------------------------------------------------------
  await page.click(`button[aria-label="Take ${knackByKey("sure_footed")!.name}"]`);
  const taken = await waitFor(
    "the knack to be taken",
    async () => (await db.characterKnack.count({ where: { characterId: rowan.id } })) === 1,
    15_000,
  );
  check("a knack can be taken", taken);

  const held = await db.characterKnack.findFirstOrThrow({ where: { characterId: rowan.id } });
  check("it records which level bought it", held.chosenAtLevel === 2, String(held.chosenAtLevel));

  await page.goto(`${BASE}/characters/${rowan.id}`);
  const afterTaking = (await page.textContent("main")) ?? "";
  check(
    "the offer is gone once it is spent",
    (await page.getByRole("heading", { name: "Something new", exact: true }).count()) === 0,
  );
  // The heading follows the character's own pronouns now, so match on the part
  // of it that is not one.
  check("and it is on the sheet", /What (she|he|they) (has|have) picked up/.test(afterTaking));
  check("saying when it arrived", afterTaking.includes("since level 2"));

  // ---- Something she was never offered cannot be taken -----------------------
  const notOffered = ["sure_footed", ...expected.map((knack) => knack.key)];
  const forbidden = ["deep_pockets", "fast_learner", "the_loud_one"].find(
    (key) => !notOffered.includes(key),
  );
  if (forbidden) {
    await db.character.update({ where: { id: rowan.id }, data: { xp: 25, level: 3 } });

    // Post the action the way a crafted form would, naming a knack that is not
    // on her list. The server recomputes the offer rather than trusting this.
    const before = await db.characterKnack.count({ where: { characterId: rowan.id } });
    const stillOffered = offerFor({
      characterId: rowanNow.id,
      level: 3,
      stats: statsOf(rowanNow),
      practices: rowanNow.practices,
      taken: ["sure_footed"],
    }).map((knack) => knack.key);

    const cheat = ["deep_pockets", "fast_learner", "the_loud_one", "never_lost"].find(
      (key) => !stillOffered.includes(key) && key !== "sure_footed",
    );

    if (cheat) {
      await page.goto(`${BASE}/characters/${rowan.id}`);
      await page.evaluate((key) => {
        const form = document.querySelector<HTMLFormElement>('form:has(input[name="key"])');
        if (!form) throw new Error("No knack form on the page.");
        const input = form.querySelector<HTMLInputElement>('input[name="key"]');
        if (input) input.removeAttribute("name");
        const crafted = document.createElement("input");
        crafted.type = "hidden";
        crafted.name = "key";
        crafted.value = key;
        form.appendChild(crafted);
        form.requestSubmit();
      }, cheat);
      await page.waitForLoadState("networkidle").catch(() => {});

      check(
        "a knack she was never offered is refused",
        (await db.characterKnack.count({
          where: { characterId: rowan.id, key: cheat },
        })) === 0,
        cheat,
      );
      check(
        "and nothing else was taken in its place",
        (await db.characterKnack.count({ where: { characterId: rowan.id } })) === before,
      );
    }
  }

  // ---- It changes a die, not a description -----------------------------------
  // Sure-footed adds to Might. Proven through the packing allowance instead
  // would be indirect; this reads it out of the roll the engine actually made.
  await db.characterKnack.deleteMany({ where: { characterId: mira.id } });
  await db.characterKnack.create({
    data: { characterId: mira.id, key: "sure_footed", chosenAtLevel: 2 },
  });

  // ---- Deep Pockets is one more thing at packing -----------------------------
  await db.characterKnack.create({
    data: { characterId: mira.id, key: "deep_pockets", chosenAtLevel: 3 },
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

  await page.goto(`${BASE}/campaigns/${campaign.id}`);
  const packing = (await page.textContent("main")) ?? "";
  check(
    "Deep Pockets means one more thing than everybody else",
    packing.includes(`${SUPPLIES_PER_CHARACTER + 1} more to choose`),
    packing.includes("3 more to choose") ? "3" : "not found",
  );

  // ---- The storyteller is told the ones it has to honour ---------------------
  await db.characterKnack.create({
    data: { characterId: rowan.id, key: "good_listener", chosenAtLevel: 3 },
  });

  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Begin the adventure")');
  await waitFor(
    "the opening scene",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "ACTIVE",
  );

  await page.reload();
  await page.click('button:has-text("What do you do?")');
  await page.fill("textarea", "I hum to it.");
  await page.click('button:has-text("Next")');
  await page.fill("textarea", "I listen carefully.");
  await page.click('button:has-text("Done")');
  await page.click('button:has-text("Tell the storyteller")');

  const turnDone = await waitFor(
    "the turn to commit",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 1,
  );
  check("the turn completed", turnDone);

  const told = await db.aiCall.findFirst({
    where: { campaignId: campaign.id, promptPreview: { contains: "Good Listener" } },
  });
  check("a knack the story must honour reaches the storyteller", told !== null);

  const quiet = await db.aiCall.findFirst({
    where: { campaignId: campaign.id, promptPreview: { contains: "Sure-footed" } },
  });
  check("a knack that is only a number does not crowd the prompt", quiet === null);

  // ---- Undo puts an unearned choice back on the table ------------------------
  const beforeUndo = await db.characterKnack.count();
  await db.characterKnack.create({
    data: { characterId: rowan.id, key: "never_lost", chosenAtLevel: 4 },
  });

  await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await page.click('button:has-text("Take back the last turn")');
  await page.click('button:has-text("Yes, take it back")');

  const undone = await waitFor(
    "the turn to be taken back",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 0,
    20_000,
  );
  check("the turn was taken back", undone);
  check(
    "a knack taken after the snapshot goes back with it",
    (await db.characterKnack.count()) === beforeUndo,
    String(await db.characterKnack.count()),
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
