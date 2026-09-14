/**
 * End-to-end check of the M1 authentication flow, driven through a real
 * browser against a running server.
 *
 * Usage:
 *   1. Start Postgres and apply migrations.
 *   2. Reset accounts and seed, so a bootstrap invite exists.
 *   3. Start the app on BASE (default http://127.0.0.1:3300).
 *   4. npx tsx tests/auth.e2e.mts
 *
 * Assumes the database has no user accounts when it starts.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { householdOf, inviteInto } from "./e2e-helpers.mjs";
import { generateInviteCode } from "../lib/auth/invite-code.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3300";
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@localhost:5432/hearthlight?schema=public";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

/**
 * Clicks a submit button and waits for the action to finish.
 *
 * Submit buttons disable themselves while their action is pending, so waiting
 * for the button to come back enabled is what actually marks completion.
 * Waiting on an alert instead races: the previous attempt's alert is already on
 * screen and matches immediately.
 */
async function submitAndSettle(page: Page, selector = 'button[type="submit"]') {
  await page.waitForSelector(`${selector}:not([disabled])`);
  await page.click(selector);
  await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 15_000 }).catch(() => {
    // A successful submit navigates away, so the button may simply be gone.
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function alertText(page: Page): Promise<string> {
  const alerts = await page.$$eval('[role="status"]', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ""),
  );
  return alerts.join(" | ");
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({ where: { isBootstrap: true, redeemedById: null } });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");
  console.log(`\nbootstrap code: ${bootstrap.code}\n`);

  // ---- Registration rejects a bad invite ---------------------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', "HEARTH-XXXX-XXXX");
    await page.fill('input[name="displayName"]', "Impostor");
    await page.fill('input[name="handle"]', "impostor@example.com");
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    check("registration rejects an unknown invite code", /not recognised/i.test(await alertText(page)));
    check("no account created", (await db.user.count()) === 0);
    await page.close();
  }

  // ---- Registration rejects a short password -----------------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', bootstrap.code);
    await page.fill('input[name="displayName"]', "Too Short");
    await page.fill('input[name="handle"]', "short@example.com");
    await page.fill('input[name="password"]', "short");
    await submitAndSettle(page);
    check("registration rejects a short password", (await db.user.count()) === 0);
    check("the invite was not consumed by the failed attempt", (await db.inviteCode.findUnique({ where: { id: bootstrap.id } }))?.redeemedById === null);
    await page.close();
  }

  // ---- First account registers and becomes admin -------------------------
  const adminContext = await browser.newContext();
  {
    const page = await adminContext.newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', bootstrap.code.toLowerCase()); // case-insensitive
    await page.fill('input[name="displayName"]', "Parent");
    await page.fill('input[name="handle"]', "  Parent@Example.COM  "); // trimmed and lowercased
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    const user = await db.user.findFirst();
    check("first account created", user !== null);
    check("email normalised", user?.email === "parent@example.com", user?.email ?? "(none)");
    check("first account administers the installation", user?.role === "PLATFORM_ADMIN", user?.role);

    // Registering makes a household in the same transaction as the account.
    // Nobody should exist outside the boundary every privacy rule is drawn
    // against, even for the moment between two writes — and an account without
    // one cannot build an adventurer at all, so this failing quietly would
    // surface much later as a builder that refuses a perfectly good form.
    const firstHome = await db.householdMember.findFirst({
      where: { userId: user?.id },
      include: { household: { select: { name: true, linkCode: true } } },
    });
    check("and it has a household of its own", firstHome !== null);
    check("named after them", firstHome?.household.name === "Parent's household", firstHome?.household.name);
    check("answering for it", firstHome?.role === "OWNER", firstHome?.role);
    check(
      "with a code it could share with another family",
      /^KIN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(firstHome?.household.linkCode ?? ""),
      firstHome?.household.linkCode,
    );
    check("session cookie issued", (await adminContext.cookies()).some((c) => c.name === "hearthlight_session"));
    check("session cookie is httpOnly", (await adminContext.cookies()).find((c) => c.name === "hearthlight_session")?.httpOnly === true);
    check("password not stored in plaintext", !(user?.passwordHash ?? "").includes("a long enough password"));
    check("password hash uses scrypt", (user?.passwordHash ?? "").startsWith("scrypt$"));
    check("session token is hashed, not stored raw", await (async () => {
      const cookie = (await adminContext.cookies()).find((c) => c.name === "hearthlight_session")?.value ?? "";
      return (await db.authSession.findFirst({ where: { tokenHash: cookie } })) === null;
    })());
    check("invite marked redeemed", (await db.inviteCode.findUnique({ where: { id: bootstrap.id } }))?.redeemedById === user?.id);
    await page.close();
  }

  // ---- A spent invite cannot be reused -----------------------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', bootstrap.code);
    await page.fill('input[name="displayName"]', "Second");
    await page.fill('input[name="handle"]', "second@example.com");
    await page.fill('input[name="password"]', "another long password");
    await submitAndSettle(page);
    check("invite cannot be reused", /already been used/i.test(await alertText(page)));
    check("still only one account", (await db.user.count()) === 1);
    await page.close();
  }

  // ---- Admin creates an invite -------------------------------------------
  let newCode = "";
  {
    const page = await adminContext.newPage();
    await page.goto(`${BASE}/settings/invites`);
    check("a household parent can reach their invitations", page.url().endsWith("/settings/invites"), page.url());

    await page.fill('input[name="forName"]', "Grandma");
    await submitAndSettle(page, 'button:has-text("Create invite code")');

    const invite = await db.inviteCode.findFirst({ where: { forName: "Grandma" } });
    newCode = invite?.code ?? "";
    check("admin created an invite", newCode !== "", newCode);
    await page.close();
  }

  // ---- Second account is a PLAYER, and cannot administer ------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', newCode);
    await page.fill('input[name="displayName"]', "Grandma");
    await page.fill('input[name="handle"]', "grandma@example.com");
    await page.fill('input[name="password"]', "grandmas long password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    const grandma = await db.user.findUnique({ where: { email: "grandma@example.com" } });
    check("second account is PLAYER", grandma?.role === "PLAYER");

    // And into the household that asked her. This assertion used to say the
    // opposite, because a code meant "make an account" and where the account
    // belonged was decided nowhere. A code written on the invitations screen
    // now says whose house it is for, and this is that sentence coming true:
    // the person invited into a family arrives in it.
    const grandmaHome = await db.householdMember.findFirst({ where: { userId: grandma?.id } });
    const parentHome = await db.householdMember.findFirst({
      where: { user: { email: "parent@example.com" } },
    });
    check("and a household", grandmaHome !== null);
    check(
      "which is the one that invited her, rather than one of her own",
      grandmaHome !== null && grandmaHome.householdId === parentHome?.householdId,
      `${grandmaHome?.householdId} vs ${parentHome?.householdId}`,
    );
    check(
      "and she arrives as somebody who plays, not somebody who invites",
      grandmaHome?.role === "MEMBER",
      grandmaHome?.role,
    );

    // She does not reach the invitations screen, and this is the *third* answer
    // this check has given. It was "only administrators" while there was one
    // family; then "anybody, because everybody answered for a household of
    // their own"; and now, since she was invited *into* a house rather than
    // sent off to start one, she is somebody who plays. Who may hand out codes
    // for a family is a question about that family, and it is not hers.
    await page.goto(`${BASE}/settings/invites`);
    check(
      "somebody who only plays does not hand out invitations",
      !page.url().endsWith("/settings/invites"),
      page.url(),
    );

    await page.goto(`${BASE}/admin`);
    check("but not the installation's", !page.url().endsWith("/admin"), page.url());

    await page.goto(`${BASE}/admin/storyteller`);
    check(
      "and certainly not the storyteller's credentials",
      !page.url().endsWith("/admin/storyteller"),
      page.url(),
    );
    await page.close();
  }

  // ---- A child signs in without an email address --------------------------
  //
  // The thing a nine-year-old could not do until now. Registration wanted a
  // unique address, and the workarounds a family reaches for — mum+mira@, or a
  // shared login — are all worse than letting her sign in with a name. An
  // account that never collects an address is also an account holding almost no
  // personal data about a child, which matters more the moment this is a
  // service rather than a copy on one family's server.
  {
    const parent = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });
    const parentHousehold = await householdOf(db, parent.id);
    const forMira = await inviteInto(db, {
      householdId: parentHousehold,
      createdById: parent.id,
      forName: "Mira",
    });

    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', forMira.code);
    await page.fill('input[name="displayName"]', "Mira");
    await page.selectOption('select[name="handleKind"]', "username");
    // Deliberately a username the old shape rules would have refused: a dot, a
    // space, and a digit first. Nothing infers a kind from the text any more,
    // so all of that is hers to choose.
    await page.fill('input[name="handle"]', "9 mira.b");
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    const mira = await db.user.findUnique({ where: { username: "9 mira.b" } });
    check("a child can register with a username", mira !== null);
    check("and holds no email address at all", mira?.email === null, mira?.email ?? "(none)");
    check(
      "and lands in the family that invited her",
      (await db.householdMember.findFirst({ where: { userId: mira?.id } }))?.householdId ===
        parentHousehold,
    );
    check("without being handed the installation", mira?.role === "PLAYER", mira?.role);

    await page.close();

    // And she can sign in with it from a cold browser, typed the way a child
    // types her own name. A fresh context rather than this one: registering
    // already signed her in, so `/login` would simply bounce her home and the
    // check would pass without ever testing a sign-in.
    const again = await (await browser.newContext()).newPage();
    await again.goto(`${BASE}/login`);
    await again.click('button:has-text("I sign in with a username")');
    await again.fill('input[name="handle"]', "  9  MIRA.B  ");
    await again.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(again);
    check(
      "and signs in with it after pressing the button, whatever the capitals and spaces",
      again.url() === `${BASE}/`,
      again.url(),
    );

    // Without pressing that button, the same text is looked for among the email
    // addresses and found nowhere — which is the whole mechanism, and the reason
    // nothing has to inspect what was typed.
    const wrongDoor = await (await browser.newContext()).newPage();
    await wrongDoor.goto(`${BASE}/login`);
    await wrongDoor.fill('input[name="handle"]', "9 mira.b");
    await wrongDoor.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(wrongDoor);
    check(
      "and the same text is not found while the form is asking for an email",
      wrongDoor.url() !== `${BASE}/`,
      wrongDoor.url(),
    );
    await wrongDoor.close();
    await again.close();
  }

  // ---- But whoever answers for a family still needs an address -------------
  {
    const parent = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });
    const newFamily = await db.inviteCode.create({
      data: { code: generateInviteCode(), grant: "NEW_HOUSEHOLD", createdById: parent.id },
    });

    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="inviteCode"]', newFamily.code);
    await page.fill('input[name="displayName"]', "A friend");
    await page.selectOption('select[name="handleKind"]', "username");
    await page.fill('input[name="handle"]', "friendly");
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);

    check(
      "a username is refused for somebody starting a family",
      /email address/i.test(await alertText(page)),
      await alertText(page),
    );
    check("and no account was made", (await db.user.count({ where: { username: "friendly" } })) === 0);

    // The same code, with an address, goes through — so the refusal was about
    // the handle and not about the invitation being broken.
    await page.close();

    // The *same* code, with an address, from a clean page — so the refusal above
    // is shown to be about the handle rather than about the invitation being
    // spent or broken. A clean page rather than a re-fill of the refused one,
    // because re-submitting a form that has just grown an error banner is a
    // fight with React's reconciliation, not a test of anything.
    const retry = await (await browser.newContext()).newPage();
    await retry.goto(`${BASE}/register`);
    await retry.fill('input[name="inviteCode"]', newFamily.code);
    await retry.fill('input[name="displayName"]', "A friend");
    await retry.fill('input[name="handle"]', "friend@example.com");
    await retry.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(retry);

    const made = await db.user.findUnique({ where: { email: "friend@example.com" } });
    check("the same invitation works with one", made !== null, made ? "" : await alertText(retry));
    check(
      "and that one does start a household of its own",
      made !== null &&
        (await db.householdMember.findFirst({ where: { userId: made.id } }))?.role === "OWNER",
    );
    await retry.close();
  }

  // ---- Login: wrong password, unknown account, then success ---------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);

    await page.fill('input[name="handle"]', "parent@example.com");
    await page.fill('input[name="password"]', "definitely wrong");
    await submitAndSettle(page);
    const wrongPasswordMessage = await alertText(page);
    check("wrong password rejected", /incorrect/i.test(wrongPasswordMessage), wrongPasswordMessage);
    check("failed attempt recorded", (await db.user.findUnique({ where: { email: "parent@example.com" } }))?.failedLoginAttempts === 1);

    await page.fill('input[name="handle"]', "nobody@example.com");
    await page.fill('input[name="password"]', "definitely wrong");
    await submitAndSettle(page);
    check("unknown account gives an identical message", (await alertText(page)) === wrongPasswordMessage);

    await page.fill('input[name="handle"]', "PARENT@example.com"); // case-insensitive
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);
    check("correct password signs in", page.url() === `${BASE}/`);
    check("failed attempts reset on success", (await db.user.findUnique({ where: { email: "parent@example.com" } }))?.failedLoginAttempts === 0);

    // Signing out lives in the account menu now, rather than shouting from the
    // bar next to the game itself.
    await page.click('button[aria-haspopup="menu"]');
    await submitAndSettle(page, '[role="menu"] button:has-text("Sign out")');
    await page.waitForURL(`${BASE}/login`);
    await page.goto(`${BASE}/profile`);
    check("signed-out user cannot reach /profile", page.url().includes("/login"), page.url());
    await page.close();
  }

  // ---- Changing a password revokes every other session -------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="handle"]', "parent@example.com");
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    await page.goto(`${BASE}/profile`);
    await page.fill('input[name="currentPassword"]', "wrong current password");
    await page.fill('input[name="newPassword"]', "a brand new long password");
    await page.fill('input[name="confirmPassword"]', "a brand new long password");
    await submitAndSettle(page, 'button:has-text("Change password")');
    check("password change requires the current password", /not correct/i.test(await alertText(page)));

    await page.fill('input[name="currentPassword"]', "a long enough password");
    await page.fill('input[name="newPassword"]', "a brand new long password");
    await page.fill('input[name="confirmPassword"]', "a brand new long password");
    await submitAndSettle(page, 'button:has-text("Change password")');
    check("password change succeeds", /Password changed/i.test(await alertText(page)));

    const remaining = await db.authSession.count({ where: { user: { email: "parent@example.com" } } });
    check("only the current session survives a password change", remaining === 1, `sessions=${remaining}`);
    await page.close();
  }

  // ---- The admin's older session was revoked by that change --------------
  {
    const page = await adminContext.newPage();
    await page.goto(`${BASE}/profile`);
    check("revoked session is rejected", page.url().includes("/login"), page.url());
    await page.close();
  }

  // ---- Preferences persist ------------------------------------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="handle"]', "parent@example.com");
    await page.fill('input[name="password"]', "a brand new long password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    await page.goto(`${BASE}/profile`);
    await page.fill('input[name="displayName"]', "Dad");
    await page.selectOption('select[name="defaultReadingLevel"]', "EARLY_READER");
    await page.selectOption('select[name="defaultTone"]', "ADVENTUROUS");
    await submitAndSettle(page, 'button:has-text("Save preferences")');

    const user = await db.user.findUnique({ where: { email: "parent@example.com" } });
    check("display name saved", user?.displayName === "Dad", user?.displayName);
    check("reading level saved", user?.defaultReadingLevel === "EARLY_READER", user?.defaultReadingLevel);
    check("tone saved", user?.defaultTone === "ADVENTUROUS", user?.defaultTone);

    // ---- Changing the address you sign in with --------------------------
    //
    // Nobody could, until now: the profile screen did display name, reading
    // level, tone and password, so changing email provider meant being stuck.
    //
    // It asks for the password, and that is the point. A session somebody else
    // had got hold of could otherwise rewrite the address and then use the
    // forgotten-password flow to keep the account for good.
    await page.fill('input[name="handle"]', "dad@example.com");
    await page.fill('input[name="signInPassword"]', "definitely not it");
    await submitAndSettle(page, 'button:has-text("Save how I sign in")');
    check(
      "changing it needs your password",
      (await db.user.count({ where: { email: "dad@example.com" } })) === 0,
    );

    await page.fill('input[name="handle"]', "dad@example.com");
    await page.fill('input[name="signInPassword"]', "a brand new long password");
    await submitAndSettle(page, 'button:has-text("Save how I sign in")');
    check(
      "and goes through with it",
      (await db.user.count({ where: { email: "dad@example.com" } })) === 1,
    );

    // A grown-up of a household is reached by email — that is what the reset
    // flow depends on — so the choice is not even drawn for them.
    check(
      "a grown-up is not offered a username",
      (await page.locator('select[name="handleKind"]').count()) === 0,
    );
    await page.close();

    const backIn = await (await browser.newContext()).newPage();
    await backIn.goto(`${BASE}/login`);
    await backIn.fill('input[name="handle"]', "dad@example.com");
    await backIn.fill('input[name="password"]', "a brand new long password");
    await submitAndSettle(backIn);
    check("the new address signs in", backIn.url() === `${BASE}/`, backIn.url());
    await backIn.close();
  }
  // ---- Repeated failures lock the account --------------------------------
  // Runs last, and against Grandma, because it deliberately locks the account.
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await page.fill('input[name="handle"]', "grandma@example.com");
      await page.fill('input[name="password"]', `wrong guess ${attempt}`);
      await submitAndSettle(page);
    }

    const locked = await db.user.findUnique({ where: { email: "grandma@example.com" } });
    check("account locks after repeated failures", (locked?.lockedUntil?.getTime() ?? 0) > Date.now());

    // Even the correct password is refused while the lock stands.
    await page.fill('input[name="handle"]', "grandma@example.com");
    await page.fill('input[name="password"]', "grandmas long password");
    await submitAndSettle(page);
    check("correct password refused while locked", /Too many failed attempts/i.test(await alertText(page)), await alertText(page));
    check("still on the login page", page.url().includes("/login"), page.url());
    await page.close();
  }
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
