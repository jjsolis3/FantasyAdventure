/**
 * Helping somebody back into their account.
 *
 * The hole this closes is not subtle. A password was set at registration and
 * changed only on a screen that asks for the current one — so a nine-year-old
 * who forgot hers was locked out of every adventurer she had ever built, and
 * nobody could help: not her parent, not whoever runs the installation. She has
 * no email address, which is the whole point of her having a username, so there
 * was nothing to send a reset link to and nothing to send it with.
 *
 * What is asserted here:
 *
 *   1. A parent sets a child's password and she signs in with it.
 *   2. **Being locked out does not survive the reset.** A forgotten password and
 *      a locked account arrive together — she tried eight times before asking
 *      for help — so a reset that left the lock in place would hand her a new
 *      password that also does not work, for fifteen minutes, with no
 *      explanation she could act on.
 *   3. **Every session that account had ends.** If the reason for the reset was
 *      that a sibling knew the old password, a still-live session on the
 *      sibling's tablet would defeat the exercise.
 *   4. Authority runs downwards: a parent cannot reset the owner, and the form
 *      is not the defence — the grant is posted through the real form anyway and
 *      the server refuses it.
 *   5. Somebody who only plays cannot reach the screen at all.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/people.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, householdOf, inviteInto, submitAndSettle } from "./e2e-helpers.mjs";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5520/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const PASSWORD = "a long enough password";
const NEW_PASSWORD = "the goat on the roof";

async function register(page: Page, code: string, name: string, handle: string, kind: "email" | "username") {
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', code);
  await page.fill('input[name="displayName"]', name);
  await page.selectOption('select[name="handleKind"]', kind);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
}

/** Signs in from a cold browser, and says whether it worked. */
async function signIn(handle: string, kind: "email" | "username", password: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  if (kind === "username") await page.click('button:has-text("I sign in with a username")');
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="password"]', password);
  await submitAndSettle(page);
  const landed = page.url() === `${BASE}/`;
  const said = landed ? "" : ((await page.textContent("body")) ?? "").slice(0, 80);
  await page.close();
  return { landed, said };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  console.log("\n-- A family with a child who signs in by name --------------------");

  const ownerPage = await (await browser.newContext()).newPage();
  await register(ownerPage, bootstrap.code, "Jose", "jose@example.com", "email");
  const owner = await db.user.findUniqueOrThrow({ where: { email: "jose@example.com" } });
  const home = await householdOf(db, owner.id);

  // The other grown-up, and the child.
  const forWrenna = await inviteInto(db, { householdId: home, createdById: owner.id, role: "PARENT" });
  const wrennaPage = await (await browser.newContext()).newPage();
  await register(wrennaPage, forWrenna.code, "Wrenna", "wrenna@example.com", "email");

  const forTamsyn = await inviteInto(db, { householdId: home, createdById: owner.id, role: "MEMBER" });
  const tamsynPage = await (await browser.newContext()).newPage();
  await register(tamsynPage, forTamsyn.code, "Tamsyn", "tamsyn", "username");
  const tamsyn = await db.user.findUniqueOrThrow({ where: { username: "tamsyn" } });

  check("she holds no email address to send a reset to", tamsyn.email === null);
  check("she is signed in on her own tablet", (await db.authSession.count({ where: { userId: tamsyn.id } })) === 1);

  console.log("\n-- She forgets it, and locks herself out -------------------------");

  // Eight wrong guesses, which is what a child does before asking for help —
  // and what the lockout threshold is.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await signIn("tamsyn", "username", "not the right one");
  }
  const lockedOut = await db.user.findUniqueOrThrow({ where: { id: tamsyn.id } });
  check("the account is locked", lockedOut.lockedUntil !== null, String(lockedOut.lockedUntil));
  check("after eight tries", lockedOut.failedLoginAttempts >= 8, String(lockedOut.failedLoginAttempts));

  console.log("\n-- Her parent sets a new one ------------------------------------");

  await ownerPage.goto(`${BASE}/settings/people`);
  await ownerPage.waitForLoadState("networkidle");
  const listed = (await ownerPage.textContent("main")) ?? "";
  check("the family is listed", listed.includes("Tamsyn") && listed.includes("Wrenna"));
  check("with how each of them signs in", listed.includes("tamsyn") && listed.includes("(username)"));

  await ownerPage.click('li:has-text("Tamsyn") button:has-text("They forgot their password")');
  await ownerPage.fill('input[name="password"]', NEW_PASSWORD);
  await ownerPage.fill('input[name="confirmPassword"]', NEW_PASSWORD);
  await ownerPage.click('button:has-text("Set their password")');
  await ownerPage.waitForSelector("text=/can sign in with the new password/", { timeout: 10_000 });

  const after = await db.user.findUniqueOrThrow({ where: { id: tamsyn.id } });
  check("the lock is lifted with it", after.lockedUntil === null && after.failedLoginAttempts === 0);
  check(
    "and every session she had is ended",
    (await db.authSession.count({ where: { userId: tamsyn.id } })) === 0,
  );

  const fresh = await signIn("tamsyn", "username", NEW_PASSWORD);
  check("she signs in with the new password, straight away", fresh.landed, fresh.said);

  const stale = await signIn("tamsyn", "username", PASSWORD);
  check("and the old one no longer works", !stale.landed);

  console.log("\n-- Authority runs downwards, not up ------------------------------");

  // The second grown-up is a PARENT. She may help the child and not the owner.
  await wrennaPage.goto(`${BASE}/settings/people`);
  await wrennaPage.waitForLoadState("networkidle");
  check(
    "a parent reaches the screen",
    wrennaPage.url().endsWith("/settings/people"),
    wrennaPage.url(),
  );

  const wrennaSees = await wrennaPage.locator('li:has-text("Jose") button').count();
  check("and is offered no way to reset the owner", wrennaSees === 0, `${wrennaSees} buttons`);

  // Hiding the button is a courtesy, not the defence. This posts the owner's id
  // through the real form, so it carries the headers a server action insists on
  // and actually reaches our code.
  await wrennaPage.click('li:has-text("Tamsyn") button:has-text("They forgot their password")');
  await wrennaPage.evaluate((ownerId) => {
    const field = document.querySelector<HTMLInputElement>('input[name="userId"]');
    if (field) field.value = ownerId;
  }, owner.id);
  await wrennaPage.fill('input[name="password"]', "a different long password");
  await wrennaPage.fill('input[name="confirmPassword"]', "a different long password");
  // Proof the injection actually took, so the check below is not passing
  // because the form quietly kept the child's id.
  const posted = await wrennaPage.inputValue('input[name="userId"]');
  check("the form really did post the owner's id", posted === owner.id, posted);

  await wrennaPage.click('button:has-text("Set their password")');

  // Asserted against the stored hash rather than against what the screen says.
  // Reading the page here races the re-render — `networkidle` resolves before
  // React has applied the response — and a check that sometimes looks too early
  // is a check that sometimes passes for the wrong reason.
  // "That is not yours to reset" rather than the owner-specific sentence,
  // because Jose is *also* the platform administrator — the first account
  // always is. So this leg proves the installation's own account is out of
  // reach of household authority, which is the stronger of the two rules.
  await wrennaPage.waitForSelector("text=/not yours to reset/", { timeout: 15_000 });
  const ownerAfter = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  check(
    "the server refuses it whatever the form said",
    ownerAfter.passwordHash === owner.passwordHash,
  );

  const ownerStillIn = await signIn("jose@example.com", "email", PASSWORD);
  check("and the administrator's own password still works", ownerStillIn.landed, ownerStillIn.said);

  console.log("\n-- Nor sideways, in a family that runs nothing -------------------");

  // The plain-owner case, which the leg above cannot reach: on this
  // installation the first account is always the platform administrator, so
  // "a parent may not reset the owner" only happens somewhere that is not this
  // household. The friend's family is exactly that shape.
  const forFriend = await db.inviteCode.create({
    data: { code: `HEARTH-FRND-0001`, grant: "NEW_HOUSEHOLD", createdById: owner.id },
  });
  const quenbyPage = await (await browser.newContext()).newPage();
  await register(quenbyPage, forFriend.code, "Quenby", "quenby@example.com", "email");
  const quenby = await db.user.findUniqueOrThrow({ where: { email: "quenby@example.com" } });
  const theirHome = await householdOf(db, quenby.id);
  check("their owner runs nothing", quenby.role !== "PLATFORM_ADMIN", quenby.role);

  const forHalbrick = await inviteInto(db, {
    householdId: theirHome,
    createdById: quenby.id,
    role: "PARENT",
  });
  const halbrickPage = await (await browser.newContext()).newPage();
  await register(halbrickPage, forHalbrick.code, "Halbrick", "halbrick@example.com", "email");

  // A child in that family, so Halbrick has somebody he legitimately may help —
  // without one, the form never opens at all and there is nothing to re-aim.
  const forMerrow = await inviteInto(db, {
    householdId: theirHome,
    createdById: quenby.id,
    role: "MEMBER",
  });
  const merrowPage = await (await browser.newContext()).newPage();
  await register(merrowPage, forMerrow.code, "Merrow", "merrow", "username");

  await halbrickPage.goto(`${BASE}/settings/people`);
  await halbrickPage.waitForLoadState("networkidle");
  const halbrickSees = await halbrickPage.locator('li:has-text("Quenby") button').count();
  check("a parent is offered no way to reset their own owner", halbrickSees === 0, `${halbrickSees}`);

  // And the same again through the real form, because the missing button is a
  // courtesy rather than the defence: the form is opened on the child he may
  // help and then re-aimed at the owner he may not.
  await halbrickPage.click('li:has-text("Merrow") button:has-text("They forgot their password")');
  const opened = await halbrickPage.locator('input[name="userId"]').count();
  if (opened === 0) {
    check("a parent can open the form on somebody", false, "no resettable person in that family");
  } else {
    await halbrickPage.evaluate((id) => {
      const field = document.querySelector<HTMLInputElement>('input[name="userId"]');
      if (field) field.value = id;
    }, quenby.id);
    await halbrickPage.fill('input[name="password"]', "another long password here");
    await halbrickPage.fill('input[name="confirmPassword"]', "another long password here");
    await halbrickPage.click('button:has-text("Set their password")');
    await halbrickPage.waitForSelector("text=/answers for this family/", { timeout: 15_000 });

    const quenbyAfter = await db.user.findUniqueOrThrow({ where: { id: quenby.id } });
    check(
      "and the server refuses that too, in so many words",
      quenbyAfter.passwordHash === quenby.passwordHash,
    );
  }

  console.log("\n-- The family names itself ---------------------------------------");

  // "Jose's household" is what the migration guessed, because three accounts
  // that are one family look like three families to a SELECT. The family is who
  // knows the answer, so it is theirs to give.
  await ownerPage.goto(`${BASE}/settings/people`);
  await ownerPage.waitForLoadState("networkidle");
  await ownerPage.fill('input[name="name"]', "The Solis family");
  await ownerPage.click('button:has-text("Save the name")');
  await ownerPage.waitForSelector("text=/called The Solis family now/", { timeout: 10_000 });
  check(
    "the owner renamed their own family, without borrowing the operator",
    (await db.household.findUniqueOrThrow({ where: { id: home } })).name === "The Solis family",
  );

  console.log("\n-- And says what each of them may do -----------------------------");

  // Tamsyn signs in with a username, so promoting her is refused with the fix
  // named rather than half-applied: a grown-up of a household is reached by
  // email, and that is what the reset flow depends on.
  await ownerPage.click('li:has-text("Tamsyn") button:has-text("Change what they may do")');
  await ownerPage.selectOption('select[name="role"]', "PARENT");
  await ownerPage.click('button:has-text("Save their job")');
  await ownerPage.waitForSelector("text=/Give them an email address first/", { timeout: 10_000 });
  check(
    "promoting a child who signs in by name is refused",
    (await db.householdMember.findFirstOrThrow({ where: { userId: tamsyn.id } })).role === "MEMBER",
  );

  // Give her an address, from the same screen, and the promotion goes through.
  await ownerPage.click('li:has-text("Tamsyn") button:has-text("Change how they sign in")');
  await ownerPage.selectOption('select[name="handleKind"]', "email");
  await ownerPage.fill('input[name="handle"]', "tamsyn@example.com");
  await ownerPage.click('button:has-text("Save how they sign in")');
  await ownerPage.waitForSelector("text=/signs in as tamsyn@example.com now/", { timeout: 10_000 });

  const moved = await db.user.findUniqueOrThrow({ where: { id: tamsyn.id } });
  check("her address is set", moved.email === "tamsyn@example.com", moved.email ?? "(none)");
  check("and her username is cleared, so she has one identity", moved.username === null);
  const movedIn = await signIn("tamsyn@example.com", "email", NEW_PASSWORD);
  check("she signs in with the new address", movedIn.landed, movedIn.said);

  await ownerPage.click('li:has-text("Tamsyn") button:has-text("Change what they may do")');
  await ownerPage.selectOption('select[name="role"]', "PARENT");
  await ownerPage.click('button:has-text("Save their job")');
  await ownerPage.waitForSelector("text=/helping run the family/", { timeout: 10_000 });
  check(
    "now the promotion goes through",
    (await db.householdMember.findFirstOrThrow({ where: { userId: tamsyn.id } })).role === "PARENT",
  );

  console.log("\n-- A username is a child's account, and only a child's -----------");

  // The invitation says which this is, so the rule reads off the invitation
  // rather than trusting the form. A grown-up's code cannot be spent on a
  // username however the sign-up page is driven.
  const forAGrownUp = await inviteInto(db, {
    householdId: theirHome,
    createdById: quenby.id,
    role: "PARENT",
  });
  const nope = await (await browser.newContext()).newPage();
  await nope.goto(`${BASE}/register`);
  await nope.fill('input[name="inviteCode"]', forAGrownUp.code);
  await nope.fill('input[name="displayName"]', "A grown-up");
  await nope.selectOption('select[name="handleKind"]', "username");
  await nope.fill('input[name="handle"]', "grownup");
  await nope.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(nope);
  check(
    "a grown-up's invitation cannot be spent on a username",
    (await db.user.count({ where: { username: "grownup" } })) === 0,
  );
  check(
    "and says why",
    ((await nope.textContent("body")) ?? "").includes("Only a child's account"),
  );
  await nope.close();

  console.log("\n-- And somebody who only plays cannot reach it -------------------");

  // Merrow, not Tamsyn. Tamsyn was promoted a moment ago and her username was
  // cleared when she got an address, so signing in as her would simply fail —
  // and a check that redirects to /login because nobody is signed in passes
  // without testing the thing it names.
  const child = await (await browser.newContext()).newPage();
  await child.goto(`${BASE}/login`);
  await child.click('button:has-text("I sign in with a username")');
  await child.fill('input[name="handle"]', "merrow");
  await child.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(child);
  check("she is signed in to start with", child.url() === `${BASE}/`, child.url());

  await child.goto(`${BASE}/settings/people`);
  check("but the screen is not hers", !child.url().endsWith("/settings/people"), child.url());
  check("and she is bounced home rather than to a sign-in", child.url() === `${BASE}/`, child.url());

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
} finally {
  await browser.close();
  await db.$disconnect();
}

process.exit(failures === 0 ? 0 : 1);
