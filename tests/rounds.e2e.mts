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

  // ---- Handing an adventurer to the player who actually plays them ----------
  //
  // The case every family will hit: one adult built the whole party before
  // anybody else had a sign-in. Mira has to be able to move to the guest's
  // account *with* everything she has earned, because a rebuilt Mira is a level
  // 1 stranger and that is a worse answer than never splitting the accounts.
  const beforeHandover = await db.character.findUniqueOrThrow({
    where: { id: mira.id },
    include: { skills: true, inventory: true },
  });

  await host.goto(`${BASE}/characters/${mira.id}`);
  // Handing an adventurer over lives with the rest of the housekeeping, behind
  // a disclosure, so the sheet ends with who she is rather than a delete button.
  await host.click('summary:has-text("Change")');
  await submitAndSettle(host, 'button:has-text("Hand Mira to another player")');

  const offered = await waitFor(
    "a handover code",
    async () =>
      (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).handoverCode !== null,
    15_000,
  );
  check("the household can offer an adventurer", offered);
  const handover = (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).handoverCode!;
  check("the code says what it is for", /^HAND-/.test(handover), handover);

  // A code nobody was given is no use.
  await strangerContext.newPage().then(async (page) => {
    await page.goto(`${BASE}/characters/claim`);
    await page.fill('input[name="code"]', "HAND-2222-3333");
    await submitAndSettle(page, 'button:has-text("Take them on")');
    await page.close();
  });
  check(
    "a wrong code takes nobody",
    (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).userId === hostUser.id,
  );

  await guest.goto(`${BASE}/characters/claim`);
  await guest.fill('input[name="code"]', handover);
  await submitAndSettle(guest, 'button:has-text("Take them on")');

  const moved = await waitFor(
    "Mira to change hands",
    async () =>
      (await db.character.findUniqueOrThrow({ where: { id: mira.id } })).userId === guestUser.id,
    15_000,
  );
  check("the adventurer moves to the other account", moved);

  const afterHandover = await db.character.findUniqueOrThrow({
    where: { id: mira.id },
    include: { skills: true, inventory: true, partyMemberships: true },
  });
  check(
    "with the experience they earned",
    afterHandover.xp === beforeHandover.xp && afterHandover.level === beforeHandover.level,
    `${beforeHandover.xp} xp -> ${afterHandover.xp} xp`,
  );
  check(
    "with their skill ranks",
    afterHandover.skills.length === beforeHandover.skills.length &&
      afterHandover.skills.every((skill) =>
        beforeHandover.skills.some((was) => was.name === skill.name && was.rank === skill.rank),
      ),
  );
  check(
    "with what they are carrying",
    afterHandover.inventory.length === beforeHandover.inventory.length,
    `${afterHandover.inventory.length} items`,
  );
  check("and still in the party, mid-adventure", afterHandover.partyMemberships.length === 1);
  check("the code is spent", afterHandover.handoverCode === null);

  // The point of the whole exercise: the player who now owns Mira can answer
  // for her, and the household that built her no longer can — except as the
  // owner of this adventure, who may still speak for anybody at their table.
  const nextRound = await guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
    data: { action: "open", mode: "ACTION" },
  });
  check("a round opens after the handover", nextRound.ok(), String(nextRound.status()));

  const guestSpeaksForMira = await guestContext.request.post(
    `${BASE}/api/campaigns/${campaign.id}/round`,
    { data: { action: "answer", characterId: mira.id, text: "I check the reeds again.", waiting: false } },
  );
  check(
    "the new owner can answer for them",
    guestSpeaksForMira.ok(),
    String(guestSpeaksForMira.status()),
  );

  const strangerSpeaks = await strangerContext.request.post(
    `${BASE}/api/campaigns/${campaign.id}/round`,
    { data: { action: "answer", characterId: mira.id, text: "I do as I please.", waiting: false } },
  );
  check(
    "somebody outside the adventure still cannot",
    strangerSpeaks.status() === 404,
    String(strangerSpeaks.status()),
  );

  // ---- Being told it is your turn -------------------------------------------
  //
  // A round is open with Mira answered, so the two households still owing an
  // answer are the ones that should be nudged — and only about their own.
  await guest.goto(`${BASE}/campaigns/${campaign.id}/play`);
  check(
    "the player who still owes an answer is told so",
    (await guest.locator("main").innerText()).includes("It's your turn"),
  );
  check(
    "and told which adventurer it is waiting on",
    (await guest.locator("main").innerText()).includes("Rowan"),
  );

  await guest.goto(`${BASE}/campaigns`);
  check(
    "the adventures list says which one is waiting for you",
    (await guest.locator("main").innerText()).includes("Your turn"),
  );

  await strangerContext.newPage().then(async (page) => {
    await page.goto(`${BASE}/campaigns`);
    check(
      "and says nothing to somebody with no part in it",
      !(await page.locator("main").innerText()).includes("Your turn"),
    );
    await page.close();
  });

  // ---- Pictures -------------------------------------------------------------
  //
  // Drawn on request rather than during a turn, once per chapter, and only ever
  // paid for once however many browsers ask at the same moment.
  const scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
  });

  // Pictures are opt-in and cost money, so a suite run without a drawing
  // service configured says so and moves on rather than failing. Set
  // IMAGE_ENABLED, IMAGE_BASE_URL and IMAGE_MODEL on the app to exercise this;
  // the mock model server draws a one-pixel PNG.
  const probe = await hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/scene-image`, {
    data: { sceneId: scene.id },
    timeout: 60_000,
  });
  const picturesOn =
    probe.ok() || !((await probe.text()).includes("switched off"));

  if (!picturesOn) {
    console.log("  ---- pictures are switched off for this run; skipping that section");
  } else {
  // Nobody asked for the first one: opening the play screen did, which is the
  // whole point — a picture appears beside the chapter without anybody pressing.
  const drawnByLooking = await waitFor(
    "the chapter to be painted",
    async () => (await db.sceneImage.count({ where: { sceneId: scene.id } })) === 1,
    60_000,
  );
  check("opening a chapter is enough to have it painted", drawnByLooking);

  // Now the race, deliberately: with the picture cleared, two devices ask at
  // the same moment, and only one of them should pay for it.
  await db.sceneImage.deleteMany({ where: { sceneId: scene.id } });

  const [firstAsk, secondAsk] = await Promise.all([
    hostContext.request.post(`${BASE}/api/campaigns/${campaign.id}/scene-image`, {
      data: { sceneId: scene.id },
      timeout: 60_000,
    }),
    guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/scene-image`, {
      data: { sceneId: scene.id },
      timeout: 60_000,
    }),
  ]);
  check(
    "two devices asking for the same picture both succeed",
    firstAsk.ok() && secondAsk.ok(),
    `${firstAsk.status()} and ${secondAsk.status()}`,
  );

  const drawnTwice = [
    ((await firstAsk.json()) as { drawn: boolean }).drawn,
    ((await secondAsk.json()) as { drawn: boolean }).drawn,
  ].filter(Boolean).length;
  check("but it is only drawn once", drawnTwice === 1, `${drawnTwice} drawings`);

  const stored = await db.sceneImage.findUnique({ where: { sceneId: scene.id } });
  check("the picture is kept with the chapter", stored !== null);
  check("as bytes, not a link that expires", (stored?.data.length ?? 0) > 0);
  check(
    "and it remembers what it was asked for",
    (stored?.prompt ?? "").includes("watercolour"),
  );

  const served = await guestContext.request.get(`${BASE}/api/scenes/${scene.id}/image`);
  check("anybody at the table can see it", served.ok(), String(served.status()));
  check("served as an image", (served.headers()["content-type"] ?? "").startsWith("image/"));

  const outsider = await strangerContext.request.get(`${BASE}/api/scenes/${scene.id}/image`);
  check("and nobody else can", outsider.status() === 404, String(outsider.status()));
  }

  // ---- The journal ----------------------------------------------------------
  await guest.goto(`${BASE}/campaigns/${campaign.id}/journal`);
  const journal = await guest.locator("main").innerText();
  check("the journal opens for anybody at the table", guest.url().includes("/journal"));
  check("it reads back what the party actually said", journal.includes(secret));
  check("it lists who went", journal.includes("Mira") && journal.includes("Rowan"));
  check("and says the adventure is still going", journal.includes("still going on"));

  // ---- Running the table ----------------------------------------------------
  await host.goto(`${BASE}/campaigns/${campaign.id}`);

  const orderBefore = (
    await db.partyMember.findMany({ where: { campaignId: campaign.id }, orderBy: { position: "asc" } })
  ).map((member) => member.characterId);

  await submitAndSettle(host, `button[aria-label="Move Rowan earlier in the turn order"]`);
  const orderAfter = (
    await db.partyMember.findMany({ where: { campaignId: campaign.id }, orderBy: { position: "asc" } })
  ).map((member) => member.characterId);
  check(
    "the host can change who is heard first",
    orderAfter.indexOf(rowan.id) === orderBefore.indexOf(rowan.id) - 1,
    orderAfter.join(",") ,
  );

  // Removing takes somebody out of this adventure without touching them.
  await host.goto(`${BASE}/campaigns/${campaign.id}`);
  await submitAndSettle(host, 'button[aria-label="Remove Fen from the party"]');

  const partyAfter = await waitFor(
    "Fen to leave the party",
    async () => (await db.partyMember.count({ where: { campaignId: campaign.id } })) === 2,
    15_000,
  );
  check("the host can take somebody out of the party", partyAfter);
  check(
    "and the adventurer themselves is untouched",
    (await db.character.findUnique({ where: { id: fen.id } })) !== null,
  );

  // Pausing refuses turns rather than merely looking different.
  await host.goto(`${BASE}/campaigns/${campaign.id}`);
  await submitAndSettle(host, 'button:has-text("Pause this adventure")');

  const pausedRow = await waitFor(
    "the adventure to pause",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "PAUSED",
    15_000,
  );
  check("the host can put the adventure down", pausedRow);
  check(
    "which puts away the round nobody finished",
    (await db.turnRound.count({
      where: { campaignId: campaign.id, status: { in: ["COLLECTING", "RESOLVING"] } },
    })) === 0,
  );

  const whilePaused = await guestContext.request.post(`${BASE}/api/campaigns/${campaign.id}/round`, {
    data: { action: "open", mode: "ACTION" },
  });
  check(
    "and refuses a new round until it is picked back up",
    whilePaused.status() === 409,
    String(whilePaused.status()),
  );

  await guest.goto(`${BASE}/campaigns/${campaign.id}/play`);
  check(
    "the rest of the table is told why nothing works",
    (await guest.locator("main").innerText()).includes("Paused"),
  );

  await host.goto(`${BASE}/campaigns/${campaign.id}`);
  await submitAndSettle(host, 'button:has-text("Pick it back up")');
  const resumed = await waitFor(
    "the adventure to resume",
    async () =>
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === "ACTIVE",
    15_000,
  );
  check("and can pick it back up again", resumed);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
