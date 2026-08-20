/**
 * End-to-end check of personal quests.
 *
 * The thing worth proving is the part a unit test cannot: that two households
 * on two browsers see *different* boards. Four players following one quest is
 * one player with four mouths; an aim of her own is only hers if the girl next
 * to her genuinely cannot see it.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1 and AI_MODEL set
 *   4. npx tsx tests/personal-quests.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { generateInviteCode } from "../lib/auth/invites.ts";

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

async function buildCharacter(
  page: Page,
  name: string,
  race: string,
  archetype: string,
  // Said out loud rather than left to the default, because one of the checks
  // below is about the sentence the table is shown when an aim is finished —
  // and that sentence is built from these.
  pronouns = "she/her",
) {
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="pronouns"]', pronouns);
  await chooseOption(page, "select#choice-race", "race", race);
  await chooseOption(page, "select#choice-archetype", "archetype", archetype);

  // Stats and skills, both of which the builder has required since the round
  // that gave every adventurer seven stats and a catalogue to pick from. A form
  // posted without them fails validation on the server and creates nothing —
  // which is how this helper came to be quietly building no adventurers at all
  // while still looking like it had.
  //
  // Spent by clicking every enabled Raise until there are none left. The button
  // disables itself at a stat's ceiling and when the budget runs out, so this
  // lands exactly on budget whatever the numbers happen to be — which is the
  // point, given that changing those numbers is what broke it last time.
  for (let guard = 0; guard < 80; guard += 1) {
    const raise = page.locator('button[aria-label^="Raise "]:not([disabled])').first();
    if ((await raise.count()) === 0) break;
    await raise.click();
  }

  const skillArea = page
    .locator("div.border-t", { hasText: "things you are especially good at" })
    .last();
  const pickable = skillArea.locator('button[type="button"]');
  await pickable.nth(0).click();
  await pickable.nth(1).click();

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

  // ---- Two households, so the boards can genuinely differ -------------------
  const hostContext = await browser.newContext();
  const host = await register(hostContext, bootstrap.code, "Parent", "parent@example.com");
  const hostUser = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });
  // Two in this household, one in the other. That covers both tables at once:
  // the parent sees every aim belonging to an adventurer they own, and none
  // belonging to the household next door.
  await buildCharacter(host, "Mira", "Halfling", "Beastfriend");
  await buildCharacter(host, "Fen", "Human", "Guardian");
  const [mira, fen] = await db.character.findMany({
    where: { userId: hostUser.id },
    orderBy: { createdAt: "asc" },
  });

  const invite = await db.inviteCode.create({
    data: { code: generateInviteCode(), createdById: hostUser.id, note: "guest household" },
  });
  const guestContext = await browser.newContext();
  const guest = await register(guestContext, invite.code, "Aunt", "aunt@example.com");
  const guestUser = await db.user.findUniqueOrThrow({ where: { email: "aunt@example.com" } });
  await buildCharacter(guest, "Rowan", "Human", "Trickster", "he/him");
  const rowan = await db.character.findFirstOrThrow({ where: { userId: guestUser.id } });

  const dragon = await db.storyline.findUniqueOrThrow({
    where: { slug: "the-dragon-who-lost-her-name" },
  });

  await host.goto(`${BASE}/campaigns/new`);
  await host.click(`button:has-text("${dragon.title}")`);
  await host.click('button:has-text("Mira")');
  await host.click('button:has-text("Fen")');
  await submitAndSettle(host, 'button:has-text("Begin the preparations")');

  const madeCampaign = await waitFor(
    "the adventure to be created",
    async () => (await db.campaign.count({ where: { ownerId: hostUser.id } })) > 0,
    15_000,
  );
  if (!madeCampaign) throw new Error("Campaign was not created.");
  const campaign = await db.campaign.findFirstOrThrow({ where: { ownerId: hostUser.id } });

  await guest.goto(`${BASE}/campaigns/join?code=${encodeURIComponent(campaign.joinCode)}`);
  await guest.click('button:has-text("Rowan")');
  await submitAndSettle(guest, 'button:has-text("Join the adventure")');
  check(
    "both households are in the party",
    (await db.partyMember.count({ where: { campaignId: campaign.id } })) === 3,
  );

  // ---- Beginning hands each of them something of their own ------------------
  await host.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await host.click('button:has-text("Begin the adventure")');
  const begun = await waitFor(
    "the opening scene",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "ACTIVE",
  );
  check("the adventure begins", begun);

  const personal = await db.quest.findMany({
    where: { campaignId: campaign.id, kind: "PERSONAL" },
    include: { objectives: true },
  });

  check("everybody got one", personal.length === 3, String(personal.length));
  check(
    "and exactly one each",
    new Set(personal.map((quest) => quest.secretForCharacterId)).size === 3,
  );
  check(
    "each belongs to a character in the party",
    personal.every((quest) =>
      [mira.id, fen.id, rowan.id].includes(quest.secretForCharacterId ?? ""),
    ),
  );
  check("each has something to do", personal.every((quest) => quest.objectives.length === 1));
  check(
    "and is filed under the chapter it belongs to",
    personal.every((quest) => quest.actIndex === 1),
  );

  // The chapter's own quest must still exist. Its guard looks up quests by
  // chapter, and personal quests now carry one too.
  const chapterQuest = await db.quest.findFirst({
    where: { campaignId: campaign.id, kind: "MAIN", actIndex: 1 },
  });
  check("the chapter still opened its own quest", chapterQuest !== null);

  const hers = personal.find((quest) => quest.secretForCharacterId === mira.id);
  const his = personal.find((quest) => quest.secretForCharacterId === rowan.id);
  if (!hers || !his) throw new Error("Expected an aim for each character.");

  // ---- Two browsers, two different boards -----------------------------------
  await host.goto(`${BASE}/campaigns/${campaign.id}/finds`);
  const hostBoard = (await host.textContent("main")) ?? "";
  const fens = personal.find((quest) => quest.secretForCharacterId === fen.id);

  check("the host sees her own aim", hostBoard.includes(hers.title));
  check("and is told it is hers alone", hostBoard.includes("just for you"));
  check(
    "and sees the other adventurer they answer for",
    hostBoard.includes(fens?.title ?? " "),
    "a shared screen has to show the parent both",
  );
  check("but not the other household's", !hostBoard.includes(his.title), his.title);

  await guest.goto(`${BASE}/campaigns/${campaign.id}/finds`);
  const guestBoard = (await guest.textContent("main")) ?? "";
  check("the guest sees his own aim", guestBoard.includes(his.title));
  check("and not hers", !guestBoard.includes(hers.title), hers.title);
  check("nor the other one in that household", !guestBoard.includes(fens?.title ?? "\u0000"));

  // Both still see the party's quest — only the personal ones are private.
  check(
    "the chapter's quest is on both boards",
    hostBoard.includes(chapterQuest?.title ?? " ") &&
      guestBoard.includes(chapterQuest?.title ?? " "),
  );

  // ---- Finishing one reveals it ---------------------------------------------
  // Marked done directly rather than played out, because what is under test is
  // the reveal, not the storyteller's judgement about when a deed is finished.
  await db.questObjective.updateMany({
    where: { questId: hers.id },
    data: { doneAtTurn: 1 },
  });

  await host.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await host.click('button:has-text("What do you do?")');
  await host.fill("textarea", "I go and do the thing I have been meaning to do.");
  await host.click('button:has-text("Next")');
  await host.fill("textarea", "I keep an eye on the pair of them.");
  await host.click('button:has-text("Next")');
  await host.fill("textarea", "I have a quiet look round.");
  await host.click('button:has-text("Done")');
  await host.click('button:has-text("Tell the storyteller")');

  const turnDone = await waitFor(
    "the turn to commit",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter === 1,
  );
  check("the turn completed", turnDone);

  // ---- The storyteller knows all of them ------------------------------------
  // It is the only party that does; that is how it engineers each girl a moment
  // rather than leaving four children pushing on the same door.
  const aimPrompt = await db.aiCall.findFirst({
    where: {
      campaignId: campaign.id,
      promptPreview: { contains: "WHAT EACH OF THEM QUIETLY WANTS" },
    },
  });
  check("the storyteller is told everyone's aim", aimPrompt !== null);

  const afterHers = await db.quest.findUniqueOrThrow({ where: { id: hers.id } });
  check("her aim is finished", afterHers.status === "COMPLETE", afterHers.status);

  const said = (await db.turnEvent.findMany({ where: { type: "SYSTEM" } }))
    .map((event) => event.content)
    .join(" | ");
  check("the table is told it was hers", said.includes("Mira had something of her own to do"), said);
  check("and she alone is paid for it", said.includes("Mira gains 6 experience"), said);
  check("not the whole party", !said.includes("Everyone gains 6"), said);

  // Now that it is done, the other household may see it.
  await guest.goto(`${BASE}/campaigns/${campaign.id}/finds`);
  const guestAfter = (await guest.textContent("main")) ?? "";
  check("finishing it tells everybody", guestAfter.includes(hers.title));
  check("with her name on it", guestAfter.includes("Mira's own"));
  check("while his own is still his", !guestAfter.includes("just for you") === false);

  // And the host still cannot see the guest's unfinished one.
  await host.goto(`${BASE}/campaigns/${campaign.id}/finds`);
  const hostAfter = (await host.textContent("main")) ?? "";
  check("an unfinished aim stays private even after somebody else's is out", !hostAfter.includes(his.title));
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
