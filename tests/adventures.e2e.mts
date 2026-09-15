/**
 * Adventures that belong to a family.
 *
 * `Storyline` had no household at all. Everything written in the app was
 * installation-wide, and only whoever ran the server could write one — so the
 * moment a second family joined, their homemade story about their own house
 * would appear in the first family's setup list, and the first family's in
 * theirs. That is the same leak households exist to close, sitting on the one
 * table households never got a column on.
 *
 * What is asserted here:
 *
 *   1. A family can copy an adventure they have played and the copy is
 *      **theirs** — not a second installation-wide row.
 *   2. Another family cannot see it: not in their setup picker, not on the
 *      landing page, and **not by hand-posting its id into campaign setup**,
 *      which is where the real leak was. The picker offered a short list, but
 *      the picker is not the rule.
 *   3. Nor edit it: the edit screen 404s rather than refusing, so asking after
 *      another family's adventure does not confirm it exists.
 *   4. A family cannot share with everybody on its own — `COMMUNITY` is the
 *      administrator's to grant, because a story that reaches other people's
 *      children should have had somebody look at it.
 *   5. Once shared, the other family *does* see it and can start it.
 *   6. A family cannot touch a shipped adventure, by form or by hand-post.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/adventures.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mjs";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5520/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const PASSWORD = "a long enough password";

// Names chosen to appear nowhere else in the app's own text — `Bram` once
// matched *brambles* in `prisma/storylines.ts` and a check passed on scenery.
// Grep before adding one.
const OPERATOR = "Halbrick";
const NEIGHBOUR = "Quenby";
const OUR_TITLE = "Tamsyn and the Lantern Moth";

async function register(page: Page, code: string, name: string, email: string) {
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', code);
  await page.fill('input[name="displayName"]', name);
  await page.fill('input[name="handle"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
}

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="handle"]', email);
  await page.fill('input[name="password"]', PASSWORD);
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
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  console.log("\n-- Two families ---------------------------------------------------");

  const operator = await (await browser.newContext()).newPage();
  await register(operator, bootstrap.code, OPERATOR, "halbrick@example.test");

  await operator.goto(`${BASE}/admin/invites`);
  await operator.selectOption('select[name="grant"]', "NEW_HOUSEHOLD");
  await operator.fill('input[name="forName"]', "The neighbours");
  await submitAndSettle(operator);
  await operator.waitForSelector("text=The neighbours");
  const familyCode = (await operator.locator("code").first().textContent())!.trim();

  const neighbourPage = await (await browser.newContext()).newPage();
  await register(neighbourPage, familyCode, NEIGHBOUR, "quenby@example.test");

  const ours = await db.user.findUniqueOrThrow({
    where: { email: "halbrick@example.test" },
    select: { id: true, households: { select: { householdId: true } } },
  });
  const theirs = await db.user.findUniqueOrThrow({
    where: { email: "quenby@example.test" },
    select: { id: true, households: { select: { householdId: true } } },
  });
  const ourHousehold = ours.households[0]!.householdId;
  const theirHousehold = theirs.households[0]!.householdId;
  check("two households, and they are not the same", ourHousehold !== theirHousehold);

  // Both need an adventurer before `/campaigns/new` will show them anything:
  // with an empty party it redirects to the builder, and every check below
  // about what the setup list offers would be reading the wrong page.
  await buildCharacter(operator, "Wrenna", "Halfling", "Beastfriend");
  await buildCharacter(neighbourPage, "Merrow", "Human", "Guardian");

  console.log("\n-- A family makes one of the shipped ones its own ------------------");

  // Copying is the way in that matters. A blank premise box is a much harder
  // job than changing the ending of a story you have already played, and the
  // second is the one a nine-year-old will sit down for.
  await operator.goto(`${BASE}/settings/adventures`);
  await operator.click('button:has-text("Make it ours")');
  await operator.waitForURL(/\/settings\/adventures\/[a-z0-9]+/);

  const copy = await db.storyline.findFirstOrThrow({
    where: { householdId: ourHousehold },
    select: { id: true, scope: true, isActive: true, isCustom: true, slug: true },
  });
  check("the copy belongs to this family", copy.scope === "HOUSEHOLD", copy.scope);
  check("and is switched off until it is finished", copy.isActive === false);
  check("and is out of the seed's hands", copy.isCustom === true);
  check(
    "and its slug cannot collide with a shipped one",
    /-[a-z0-9]+$/.test(copy.slug) && copy.slug !== "the-fog",
    copy.slug,
  );

  // Rename it to something findable, and switch it on.
  await operator.fill('input[name="title"]', OUR_TITLE);
  await operator.check('input[name="isActive"]');
  await submitAndSettle(operator);
  await operator.waitForURL(/\/settings\/adventures\?saved=/);

  const saved = await db.storyline.findUniqueOrThrow({
    where: { id: copy.id },
    select: { title: true, scope: true, householdId: true, isActive: true },
  });
  check("the edit stuck", saved.title === OUR_TITLE, saved.title);
  check("and saving did not change whose it is", saved.householdId === ourHousehold);
  check("it is offered to us now", saved.isActive === true);

  // It is on our own setup screen, which is the point of the whole exercise.
  await operator.goto(`${BASE}/campaigns/new`);
  check(
    "and it is offered when we set up an adventure",
    ((await operator.textContent("body")) ?? "").includes(OUR_TITLE),
  );

  console.log("\n-- The other family sees none of it --------------------------------");

  await neighbourPage.goto(`${BASE}/campaigns/new`);
  check(
    "not in their setup list",
    !((await neighbourPage.textContent("body")) ?? "").includes(OUR_TITLE),
  );

  await neighbourPage.goto(`${BASE}/`);
  check(
    "nor on the front page",
    !((await neighbourPage.textContent("body")) ?? "").includes(OUR_TITLE),
  );

  // By status rather than by looking for words on the page: Next's own
  // not-found page says "This page could not be found", which does not contain
  // the phrase a body-text check would look for — so that check would fail for
  // the wrong reason today and pass for the wrong reason tomorrow.
  const peek = await neighbourPage.goto(`${BASE}/settings/adventures/${copy.id}`);
  check(
    "and asking after it directly is a 404, not a refusal",
    peek?.status() === 404,
    String(peek?.status()),
  );

  // The leak itself. `createCampaignAction` validated the chosen adventure with
  // `{ id, isActive }` and no household filter at all — so the picker was the
  // only thing standing between a hand-posted id and another family's story.
  // The neighbour has an adventurer of their own, so the setup form is real and
  // the request below is a legitimate one with exactly one thing wrong with it.
  const theirCharacters = await db.character.count({ where: { householdId: theirHousehold } });
  check("(the neighbour has an adventurer, so the form is real)", theirCharacters === 1);

  // Posted **through the real form**, with the adventure id swapped for one the
  // picker never offered. A bare `fetch` to the same URL would not do: a server
  // action wants headers a raw POST has not got, so Next refuses it before any
  // of our code runs — and a check written that way passes whether the guard
  // exists or not, which is the worst kind of green.
  const before = await db.campaign.count({ where: { storylineId: copy.id } });
  await neighbourPage.goto(`${BASE}/campaigns/new`);
  await neighbourPage.fill('input[name="title"]', "Not mine to start");

  const swapped = await neighbourPage.evaluate((storylineId) => {
    // The picker is a radio group or a select depending on how many there are;
    // either way the value that reaches the action is what matters.
    const chosen = document.querySelector<HTMLInputElement>('input[name="storylineId"]:checked');
    if (chosen) {
      chosen.value = storylineId;
      return "radio";
    }
    const select = document.querySelector<HTMLSelectElement>('select[name="storylineId"]');
    if (select) {
      const option = document.createElement("option");
      option.value = storylineId;
      option.selected = true;
      select.appendChild(option);
      return "select";
    }
    const hidden = document.querySelector<HTMLInputElement>('input[name="storylineId"]');
    if (hidden) {
      hidden.value = storylineId;
      return "hidden";
    }
    return "none";
  }, copy.id);
  check("(the setup form has an adventure field to tamper with)", swapped !== "none", swapped);

  // Their own adventurer goes in the party, so nothing else about the request
  // is objectionable. The storyline is checked first in any case, which is why
  // the message below is about the adventure rather than about the party.
  await neighbourPage.locator('input[name="partyIds"]').first().check().catch(() => {});
  await submitAndSettle(neighbourPage);

  const after = await db.campaign.count({ where: { storylineId: copy.id } });
  check("and a hand-posted id starts nothing", after === before, `${before} → ${after}`);
  check(
    "and says so rather than failing oddly",
    ((await neighbourPage.textContent("body")) ?? "").includes("not available"),
  );

  console.log("\n-- Sharing is the administrator's to grant -------------------------");

  // A family cannot publish to everybody on its own. This is a children's app:
  // a story that reaches other people's children should have had somebody look
  // at it, and the alternative is building moderation.
  await operator.goto(`${BASE}/settings/adventures/${copy.id}`);
  check(
    "there is no share control on the family's screen",
    (await operator.locator('select[name="scope"]').count()) === 0,
  );

  await operator.goto(`${BASE}/admin/adventures`);
  const scopeForm = operator.locator(
    `form:has(input[value="${copy.id}"]):has(select[name="scope"])`,
  );
  await scopeForm.locator('select[name="scope"]').selectOption("COMMUNITY");
  await scopeForm.locator('button[type="submit"]').click();
  await operator.waitForLoadState("networkidle").catch(() => {});

  const shared = await db.storyline.findUniqueOrThrow({
    where: { id: copy.id },
    select: { scope: true, householdId: true },
  });
  check("the administrator can share it", shared.scope === "COMMUNITY", shared.scope);
  check("and it keeps its author, so they can still edit it", shared.householdId === ourHousehold);

  await neighbourPage.goto(`${BASE}/campaigns/new`);
  check(
    "now the other family is offered it",
    ((await neighbourPage.textContent("body")) ?? "").includes(OUR_TITLE),
  );

  console.log("\n-- A shipped adventure is nobody's family's ------------------------");

  const shipped = await db.storyline.findFirstOrThrow({
    where: { scope: "SYSTEM" },
    select: { id: true, title: true, isCustom: true },
  });

  const neighbour = await signIn(browser, "quenby@example.test");
  const shippedPeek = await neighbour.goto(`${BASE}/settings/adventures/${shipped.id}`);
  check(
    "a family cannot open the editor for one",
    shippedPeek?.status() === 404,
    `${shipped.title} — ${shippedPeek?.status()}`,
  );

  // And the form is not the defence. Posted through the real one with the id
  // swapped, which is what somebody with the developer tools open would do.
  await neighbour.goto(`${BASE}/settings/adventures/new`);
  await neighbour.fill('input[name="title"]', "Hijacked");
  await neighbour.fill('input[name="tagline"]', "x");
  await neighbour.fill('textarea[name="premise"]', "x");
  await neighbour.fill('textarea[name="hook"]', "x");
  await neighbour.fill('input[name="actTitle"]', "One");
  await neighbour.fill('textarea[name="actGoal"]', "Something happens.");
  await neighbour.evaluate((id) => {
    const form = document.querySelector("form");
    const field = document.createElement("input");
    field.name = "id";
    field.value = id;
    form?.appendChild(field);
  }, shipped.id);
  await submitAndSettle(neighbour);

  const untouched = await db.storyline.findUniqueOrThrow({
    where: { id: shipped.id },
    select: { title: true, isCustom: true },
  });
  check(
    "nor overwrite one by posting its id",
    untouched.title === shipped.title && untouched.isCustom === shipped.isCustom,
    untouched.title,
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
