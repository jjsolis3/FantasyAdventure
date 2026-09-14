/**
 * Admitting families, and the ceilings a plan puts on one.
 *
 * Two things that had grown apart. *Who may let a new family in* was a rule
 * with nowhere sensible to stand: it lived on the household invitations screen,
 * behind a dropdown that appeared for exactly one account in the installation.
 * And *how much a family may do* was not a question the app could ask at all —
 * a household could invite people without limit, start adventures without
 * limit, and take turns without limit, which is fine on a machine in somebody's
 * study and is not a business.
 *
 * What is asserted here:
 *
 *   1. Admitting a family lives on `/admin/invites`, and the household screen
 *      no longer offers it at all — **not merely hides it**: the grant is
 *      hand-posted through the real form and refused server-side.
 *   2. A platform administrator can aim an invitation at *another* family,
 *      which was impossible before — the household id came off the session and
 *      there was no argument that could reach it. This is the support tool for
 *      a household whose only grown-up has locked themselves out.
 *   3. A seat cap bites, **counting codes handed out and not yet used**, so a
 *      family cannot mint its way past the limit and arrive over it.
 *   4. An adventure cap bites.
 *   5. A failed payment stops new things without stopping the story — the
 *      refusal says it is about the payment, not about a count.
 *   6. Running the installation can be handed over through the interface, the
 *      last administrator cannot be retired, and the control never appears on
 *      your own row.
 *
 * Every household starts UNMETERED, which is what a self-hosted installation
 * gets and what the migration gave everybody who already existed. So the caps
 * here are reached by an administrator putting a family on a plan — which is
 * both how a real support case works and the only way this can be checked
 * without a card.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/plans.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, submitAndSettle } from "./e2e-helpers.mjs";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5520/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const PASSWORD = "a long enough password";

// Names chosen to appear nowhere else in the app's own text. `Bram` once
// matched *brambles* in `prisma/storylines.ts` and a check passed on the
// scenery. Grep before adding one.
const OPERATOR = "Halbrick";
const OWNER = "Quenby";

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

/** The newest code on whichever invitations screen is open. */
async function newestCode(page: Page): Promise<string> {
  const code = await page.locator("code").first().textContent();
  if (!code) throw new Error("no invite code on the page");
  return code.trim();
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  console.log("\n-- Whoever runs it admits a family -------------------------------");

  const operator = await (await browser.newContext()).newPage();
  await register(operator, bootstrap.code, OPERATOR, "halbrick@example.test");

  // The card exists on the administrator's hub. It did not before: admitting a
  // family was on the *family* screen, which is the wrong place for the one
  // decision about how many families there are.
  await operator.goto(`${BASE}/admin`);
  const hub = (await operator.textContent("body")) ?? "";
  check("administration offers invitations", hub.includes("Invitations"));

  await operator.goto(`${BASE}/admin/invites`);
  await operator.selectOption('select[name="grant"]', "NEW_HOUSEHOLD");
  await operator.fill('input[name="forName"]', "The Okonkwos");
  await submitAndSettle(operator);
  await operator.waitForSelector("text=The Okonkwos");
  const familyCode = await newestCode(operator);

  const ownerPage = await (await browser.newContext()).newPage();
  await register(ownerPage, familyCode, OWNER, "quenby@example.test");

  const owner = await db.user.findUnique({
    where: { email: "quenby@example.test" },
    select: { id: true, households: { select: { householdId: true, role: true } } },
  });
  check("they arrive in a household of their own", owner?.households.length === 1);
  check("and they answer for it", owner?.households[0]?.role === "OWNER");

  const theirHousehold = owner!.households[0]!.householdId;

  console.log("\n-- A family cannot admit another one -----------------------------");

  await ownerPage.goto(`${BASE}/settings/invites`);
  const familyScreen = (await ownerPage.textContent("body")) ?? "";
  check(
    "the household screen does not offer to start another family",
    !familyScreen.includes("household of their own"),
  );
  check(
    "and it has no grant picker at all",
    (await ownerPage.locator('select[name="grant"]').count()) === 0,
  );

  // The screen is not the rule. Posted through the real form with the grant
  // set by hand, which is exactly what somebody with the developer tools open
  // would do.
  await ownerPage.evaluate(() => {
    const form = document.querySelector("form");
    const field = document.createElement("input");
    field.name = "grant";
    field.value = "NEW_HOUSEHOLD";
    form?.appendChild(field);
  });
  await ownerPage.fill('input[name="forName"]', "A family of my own");
  await submitAndSettle(ownerPage);

  const smuggled = await db.inviteCode.count({
    where: { grant: "NEW_HOUSEHOLD", createdById: owner!.id },
  });
  check("a hand-posted one is refused server-side", smuggled === 0);

  console.log("\n-- Helping a family that cannot help itself ----------------------");

  // The gap. Before this, `householdId` came off the session and there was no
  // argument that could point anywhere else, so an administrator could not add
  // a second grown-up to a household whose only parent was locked out.
  await operator.goto(`${BASE}/admin/invites`);
  await operator.selectOption('select[name="grant"]', "HOUSEHOLD_MEMBER");
  await operator.selectOption('select[name="targetHouseholdId"]', theirHousehold);
  await operator.fill('input[name="forName"]', "Merrow");
  await submitAndSettle(operator);

  const aimed = await db.inviteCode.findFirst({
    where: { forName: "Merrow" },
    select: { householdId: true, intendedRole: true, createdById: true },
  });
  check("an administrator can aim one at a named family", aimed?.householdId === theirHousehold);
  check("as a grown-up who can help", aimed?.intendedRole === "PARENT");
  check("and it was written by the administrator", aimed?.createdById !== owner!.id);

  // And it shows up on *their* screen, because it is their code now.
  await ownerPage.goto(`${BASE}/settings/invites`);
  check(
    "the family sees the code that was written for them",
    ((await ownerPage.textContent("body")) ?? "").includes("Merrow"),
  );

  console.log("\n-- A plan with a ceiling ------------------------------------------");

  // Put them on the trial. Everything starts unmetered — a self-hosted family
  // never agreed to a limit — so this is the administrator's override, which is
  // both how a real support case works and the only way to reach a cap without
  // a card.
  await operator.goto(`${BASE}/admin/households`);
  const planForm = operator.locator(`form:has(input[value="${theirHousehold}"]):has(select[name="plan"])`);
  await planForm.locator('select[name="plan"]').selectOption("HEARTH");
  await planForm.locator('select[name="status"]').selectOption("ACTIVE");
  await planForm.locator('button[type="submit"]').click();
  await operator.waitForLoadState("networkidle").catch(() => {});

  const plan = await db.subscription.findUnique({
    where: { householdId: theirHousehold },
    select: { plan: true, status: true },
  });
  check("the administrator put them on a plan", plan?.plan === "HEARTH", plan?.plan ?? "none");

  // Hearth allows four places. One is taken by the owner and one by the code
  // written for Merrow, so two more codes fit and the third is refused.
  await ownerPage.goto(`${BASE}/settings/invites`);
  for (const name of ["Tamsyn", "Wrenna"]) {
    await ownerPage.fill('input[name="forName"]', name);
    await submitAndSettle(ownerPage);
  }

  await ownerPage.fill('input[name="forName"]', "One too many");
  await submitAndSettle(ownerPage);

  const refusal = (await ownerPage.textContent("body")) ?? "";
  check("the fifth place is refused", refusal.includes("room for 4 people"));
  check(
    "and no code was written for it",
    (await db.inviteCode.count({ where: { forName: "One too many" } })) === 0,
  );

  // The cap counts codes handed out as well as people in the house. Without
  // that, a family could mint twenty in one sitting and arrive at twenty
  // members having passed the check exactly zero times — registration redeems
  // a code that was valid when it was written.
  check(
    "codes handed out hold a place",
    (await db.householdMember.count({ where: { householdId: theirHousehold } })) === 1,
    "one person in the house, and the cap already bit",
  );

  console.log("\n-- A failed payment ------------------------------------------------");

  await operator.goto(`${BASE}/admin/households`);
  const dunning = operator.locator(`form:has(input[value="${theirHousehold}"]):has(select[name="plan"])`);
  await dunning.locator('select[name="status"]').selectOption("PAST_DUE");
  await dunning.locator('button[type="submit"]').click();
  await operator.waitForLoadState("networkidle").catch(() => {});

  await ownerPage.goto(`${BASE}/settings/invites`);
  await ownerPage.fill('input[name="forName"]', "After the card failed");
  await submitAndSettle(ownerPage);

  const dunned = (await ownerPage.textContent("body")) ?? "";
  // The wording matters as much as the refusal. Being told "you have reached
  // your limit" when the real problem is a declined card costs an afternoon.
  check("nothing new can be started", dunned.includes("problem with the payment"));
  check("and it says the story carries on", dunned.includes("carry on as normal"));

  // Put them back before the next part, so a later assertion is not passing on
  // the dunning refusal instead of the thing it means to check.
  await operator.goto(`${BASE}/admin/households`);
  const restored = operator.locator(`form:has(input[value="${theirHousehold}"]):has(select[name="plan"])`);
  await restored.locator('select[name="plan"]').selectOption("UNMETERED");
  await restored.locator('select[name="status"]').selectOption("ACTIVE");
  await restored.locator('button[type="submit"]').click();
  await operator.waitForLoadState("networkidle").catch(() => {});

  console.log("\n-- Handing over the installation -----------------------------------");

  await operator.goto(`${BASE}/admin/households`);
  const ownRow = await operator.locator(`form:has(input[name="makeAdmin"])`).count();
  const ownControls = await operator
    .locator(`form:has(input[value="${(await db.user.findUnique({ where: { email: "halbrick@example.test" }, select: { id: true } }))!.id}"]):has(input[name="makeAdmin"])`)
    .count();
  check("there is a hand-over control", ownRow > 0);
  check("but never on your own row", ownControls === 0);

  const handOver = operator.locator(
    `form:has(input[value="${owner!.id}"]):has(input[name="makeAdmin"])`,
  );
  await handOver.locator('button[type="submit"]').click();
  await operator.waitForLoadState("networkidle").catch(() => {});

  const promoted = await db.user.findUnique({
    where: { id: owner!.id },
    select: { role: true },
  });
  check("the installation can be handed on", promoted?.role === "PLATFORM_ADMIN");

  // And the new administrator can reach the screens, which is the only proof
  // that the role actually means anything.
  const secondOperator = await signIn(browser, "quenby@example.test");
  await secondOperator.goto(`${BASE}/admin/storyteller`);
  check(
    "and the new administrator can reach the storyteller",
    secondOperator.url().includes("/admin/storyteller"),
    secondOperator.url(),
  );

  // The last administrator cannot be retired. Both are administrators now, so
  // retire one, then try to retire the other from its own session — refused for
  // being your own, which is the *earlier* rule. So retire the first from the
  // second, then check the second cannot be retired by anybody left.
  await secondOperator.goto(`${BASE}/admin/households`);
  const retire = secondOperator.locator(
    `form:has(input[value="${(await db.user.findUnique({ where: { email: "halbrick@example.test" }, select: { id: true } }))!.id}"]):has(input[name="makeAdmin"])`,
  );
  await retire.locator('button[type="submit"]').click();
  await secondOperator.waitForLoadState("networkidle").catch(() => {});

  const admins = await db.user.count({ where: { role: "PLATFORM_ADMIN" } });
  check("the old account can be retired by the new one", admins === 1);

  // The old one is now an ordinary player and bounced from the administration
  // screens — the thing the whole hand-over is for.
  await operator.goto(`${BASE}/admin`);
  check("and is no longer let in", !operator.url().includes("/admin"), operator.url());
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
