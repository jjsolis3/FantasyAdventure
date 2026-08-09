/**
 * End-to-end check of playing from separate devices.
 *
 * Two households, two browsers, one adventure: the interesting parts are the
 * ones a single-browser test cannot see — that a guest can reach somebody
 * else's adventure at all, that they can only answer for their own adventurer,
 * that the turn waits for everybody, and above all that two browsers noticing
 * "everyone is in" at the same moment take exactly one turn between them.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. Start the app with AI_BASE_URL=http://127.0.0.1:11499/v1
 *   4. npx tsx tests/rounds.e2e.mts
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

async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`  (timed out waiting for ${label})`);
  return false;
}

/**
 * Picks a race/calling and confirms it registered.
 *
 * These selects are controlled by React and write through to a hidden input.
 * Selecting before hydration completes silently does nothing, so this retries
 * until the hidden input agrees.
 */
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
  const bootstrap = await db.inviteCode.findFirst({ where: { isBootstrap: true, redeemedById: null } });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");

  // ---- Household one: the table that owns the adventure ---------------------
  const hostContext = await browser.newContext();
  const host = await register(hostContext, bootstrap.code, "Parent", "parent@example.com");
  const hostUser = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });

  await buildCharacter(host, "Mira", "Halfling", "Beastfriend");
  await buildCharacter(host, "Fen", "Human", "Guardian");

  const [mira, fen] = await db.character.findMany({
    where: { userId: hostUser.id },
    orderBy: { createdAt: "asc" },
  });

  // ---- Household two: invited, with an adventurer of their own --------------
  const invite = await db.inviteCode.create({
    data: { code: generateInviteCode(), createdById: hostUser.id, note: "guest household" },
  });

  const guestContext = await browser.newContext();
  const guest = await register(guestContext, invite.code, "Aunt", "aunt@example.com");
  const guestUser = await db.user.findUniqueOrThrow({ where: { email: "aunt@example.com" } });
  await buildCharacter(guest, "Rowan", "Human", "Trickster");
  const rowan = await db.character.findFirstOrThrow({ where: { userId: guestUser.id } });

  // ---- An adventure everyone answers separately -----------------------------
  const dragon = await db.storyline.findUniqueOrThrow({ where: { slug: "the-dragon-who-lost-her-name" } });
  await host.goto(`${BASE}/campaigns/new`);
  await host.click(`button:has-text("${dragon.title}")`);
  await host.click('button:has-text("Mira")');
  await host.click('button:has-text("Fen")');
  await host.click('button:has-text("Everyone on their own device")');
  await submitAndSettle(host, 'button:has-text("Begin the preparations")');

  const madeCampaign = await waitFor(
    "the adventure to be created",
    async () => (await db.campaign.count({ where: { ownerId: hostUser.id } })) > 0,
    15_000,
  );
  if (!madeCampaign) {
    const alerts = await host.$$eval('[role="status"]', (nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
    throw new Error(`Campaign was not created. Page said: ${alerts.join(" | ") || "(nothing)"}`);
  }

  const campaign = await db.campaign.findFirstOrThrow({ where: { ownerId: hostUser.id } });
  check("the adventure remembers that everyone is on their own device", campaign.inputMode === "OWN_DEVICE");
  check("it has a join code", /^PARTY-/.test(campaign.joinCode), campaign.joinCode);

  // ---- Joining -------------------------------------------------------------
  await guest.goto(`${BASE}/campaigns/join?code=${encodeURIComponent(campaign.joinCode)}`);
  await guest.click('button:has-text("Rowan")');
  await submitAndSettle(guest, 'button:has-text("Join the adventure")');

  const party = await db.partyMember.findMany({
    where: { campaignId: campaign.id },
    orderBy: { position: "asc" },
  });
  check("the guest's adventurer joined the party", party.length === 3);
  check(
    "and joined at the back of the turn order",
    party.at(-1)?.characterId === rowan.id,
    party.map((member) => member.position).join(","),
  );

  // A campaign somebody else owns is now reachable, and readable.
  const guestPlay = await guestContext.request.get(`${BASE}/campaigns/${campaign.id}/play`);
  check("the guest can open the play page", guestPlay.status() === 200, String(guestPlay.status()));
  const guestPlayBody = await guestPlay.text();
  check("and sees every adventurer's sheet, not only their own", guestPlayBody.includes("Mira"));

  // ---- Somebody with no adventurer in it sees nothing -----------------------
  const strangerInvite = await db.inviteCode.create({
    data: { code: generateInviteCode(), createdById: hostUser.id },
  });
  const strangerContext = await browser.newContext();
  await register(strangerContext, strangerInvite.code, "Stranger", "stranger@example.com");
  const strangerState = await strangerContext.request.get(`${BASE}/api/campaigns/${campaign.id}/state`);
  check(
    "a household with nobody in the party cannot see the adventure",
    strangerState.status() === 404,
    String(strangerState.status()),
  );

  // ---- Beginning ------------------------------------------------------------
  await host.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await host.click('button:has-text("Begin the adventure")');
  const begun = await waitFor("the opening scene", async () => {
    const row = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    return row.status === "ACTIVE";
  });
  check("the adventure begins", begun);

  // ---- One round, answered from two households ------------------------------
  const opened = await hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
    data: { action: "open", mode: "ACTION" },
  });
  check("a round opens", opened.ok(), String(opened.status()));
  const round = ((await opened.json()) as { round: { id: string; number: number } }).round;

  // Answering for somebody else's adventurer is refused.
  const trespass = await guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
    data: { action: "answer", characterId: mira.id, text: "I take Mira's turn", waiting: false },
  });
  check(
    "a guest cannot answer for another household's adventurer",
    trespass.status() === 403,
    String(trespass.status()),
  );

  // The owner may answer for their own two, which is how a child without an
  // account of their own still gets a say.
  for (const [character, text] of [
    [mira, "I hum the tune the goats like, very quietly."],
    [fen, "I stand between the others and the dark."],
  ] as const) {
    const answered = await hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
      data: { action: "answer", characterId: character.id, text, waiting: false },
    });
    check(`${character.name}'s answer is accepted`, answered.ok(), String(answered.status()));
  }

  const halfway = await hostContext.request.get(`${BASE}/api/campaigns/${campaign.id}/state`);
  const halfwayRound = ((await halfway.json()) as { round: { everyoneIn: boolean; waitingFor: string[] } })
    .round;
  check("the round waits for the household that has not answered", halfwayRound.everyoneIn === false);
  check("and says who it is waiting for", halfwayRound.waitingFor.join() === rowan.id);

  // A turn cannot be taken early, however hard anybody presses.
  const early = await hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/turn`, {
    data: { mode: "round", roundId: round.id },
  });
  check("the turn cannot be taken before everybody is in", early.status() === 409, String(early.status()));

  const guestAnswer = await guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
    data: { action: "answer", characterId: rowan.id, text: "I creep round the other side.", waiting: false },
  });
  check("the guest answers for their own adventurer", guestAnswer.ok(), String(guestAnswer.status()));

  const ready = await guestContext.request.get(`${BASE}/api/campaigns/${campaign.id}/state`);
  const readyRound = ((await ready.json()) as { round: { everyoneIn: boolean; startsItself: boolean } }).round;
  check("everybody is in", readyRound.everyoneIn === true);
  check("and the turn will start itself", readyRound.startsItself === true);

  // ---- Both browsers reach for the turn at the same moment -------------------
  const before = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  const [hostTurn, guestTurn] = await Promise.all([
    hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/turn`, {
      data: { mode: "round", roundId: round.id },
      timeout: 120_000,
    }),
    guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/turn`, {
      data: { mode: "round", roundId: round.id },
      timeout: 120_000,
    }),
  ]);

  const statuses = [hostTurn.status(), guestTurn.status()].sort();
  check(
    "exactly one browser is given the turn",
    statuses[0] === 200 && statuses[1] === 409,
    statuses.join(" and "),
  );

  // Drain whichever stream was handed a turn, so the pipeline finishes.
  await Promise.all([hostTurn.text().catch(() => ""), guestTurn.text().catch(() => "")]);

  const played = await waitFor("the turn to be committed", async () => {
    const row = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    return row.turnCounter === before.turnCounter + 1;
  });
  check("the turn is taken once, not twice", played);

  const rounds = await db.turnRound.findMany({ where: { campaignId: campaign.id } });
  check("there is one round, and it is finished", rounds.length === 1 && rounds[0].status === "RESOLVED");

  const actions = await db.turnEvent.findMany({
    where: { scene: { campaignId: campaign.id }, type: "PLAYER_ACTION" },
  });
  check(
    "all three answers reached the storyteller",
    actions.length === 3,
    `${actions.length} player actions`,
  );

  // ---- The next round is open to anybody ------------------------------------
  const guestOpens = await guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
    data: { action: "open", mode: "ACTION" },
  });
  check("a guest can open the next round", guestOpens.ok(), String(guestOpens.status()));
  const second = ((await guestOpens.json()) as { round: { number: number } }).round;
  check("and it is the second round", second.number === 2, String(second.number));

  // Two devices asking for a round at the same moment get the same one.
  const [again, andAgain] = await Promise.all([
    hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
      data: { action: "open", mode: "ACTION" },
    }),
    guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
      data: { action: "open", mode: "ACTION" },
    }),
  ]);
  const ids = [
    ((await again.json()) as { round: { id: string } }).round.id,
    ((await andAgain.json()) as { round: { id: string } }).round.id,
  ];
  check("two devices opening a round land in the same one", ids[0] === ids[1]);

  const openRounds = await db.turnRound.count({
    where: { campaignId: campaign.id, status: { in: ["COLLECTING", "RESOLVING"] } },
  });
  check("only one round is ever open", openRounds === 1, `${openRounds} open`);

  // ---- The same round, driven through two real browsers ---------------------
  //
  // The API checks above prove the server's half. This proves the half that
  // actually has to work on a phone: three answers typed on two devices, and a
  // turn that starts itself when the last one lands, with nobody pressing send.
  await host.goto(`${BASE}/campaigns/${campaign.id}/play`);
  await guest.goto(`${BASE}/campaigns/${campaign.id}/play`);

  const secret = "I follow the trail of dropped feathers into the reeds.";

  async function answerOnScreen(page: Page, characterId: string, text: string) {
    const row = page.locator(`[data-character-id="${characterId}"]`);
    await row.locator("textarea").waitFor({ timeout: 20_000 });
    await row.locator("textarea").fill(text);
    await row.getByRole("button", { name: /ready/i }).click();
  }

  await answerOnScreen(host, mira.id, secret);
  await answerOnScreen(host, fen.id, "I keep watch behind us.");

  // The guest's board should already know two of the three are in.
  const sawWaiting = await waitFor(
    "the guest's screen to show the others' answers",
    async () => (await guest.locator(`[data-character-id="${mira.id}"]`).innerText()).includes(secret),
    30_000,
  );
  check("everyone's answers appear on everyone's screen as they arrive", sawWaiting);

  const turnsBefore = (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter;
  await answerOnScreen(guest, rowan.id, "I whistle the way Mira taught me.");

  const startedItself = await waitFor(
    "the turn to start itself",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).turnCounter ===
      turnsBefore + 1,
    120_000,
  );
  check("the last answer starts the turn, with nobody pressing send", startedItself);

  const stillOne = await db.turnRound.count({
    where: { campaignId: campaign.id, number: second.number, status: "RESOLVED" },
  });
  check("and the round it came from is finished", stillOne === 1);

  for (const [who, page] of [
    ["the host", host],
    ["the guest", guest],
  ] as const) {
    const caughtUp = await waitFor(
      `${who}'s transcript to catch up`,
      async () => (await page.locator("main").innerText()).includes(secret),
      60_000,
    );
    check(`${who} sees the finished turn without touching anything`, caughtUp);
  }
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
