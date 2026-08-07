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
    await page.fill('input[name="email"]', "impostor@example.com");
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
    await page.fill('input[name="email"]', "short@example.com");
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
    await page.fill('input[name="email"]', "  Parent@Example.COM  "); // trimmed and lowercased
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    const user = await db.user.findFirst();
    check("first account created", user !== null);
    check("email normalised", user?.email === "parent@example.com", user?.email);
    check("first account is ADMIN", user?.role === "ADMIN", user?.role);
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
    await page.fill('input[name="email"]', "second@example.com");
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
    await page.goto(`${BASE}/invites`);
    check("admin can reach /invites", page.url().endsWith("/invites"), page.url());

    await page.fill('input[name="note"]', "Grandma");
    // Not `button[type=submit]` — the header's Sign out button precedes it in the DOM.
    await submitAndSettle(page, 'button:has-text("Create invite code")');

    const invite = await db.inviteCode.findFirst({ where: { note: "Grandma" } });
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
    await page.fill('input[name="email"]', "grandma@example.com");
    await page.fill('input[name="password"]', "grandmas long password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);

    check("second account is PLAYER", (await db.user.findUnique({ where: { email: "grandma@example.com" } }))?.role === "PLAYER");

    await page.goto(`${BASE}/invites`);
    check("non-admin is redirected away from /invites", !page.url().endsWith("/invites"), page.url());
    await page.close();
  }

  // ---- Login: wrong password, unknown account, then success ---------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);

    await page.fill('input[name="email"]', "parent@example.com");
    await page.fill('input[name="password"]', "definitely wrong");
    await submitAndSettle(page);
    const wrongPasswordMessage = await alertText(page);
    check("wrong password rejected", /incorrect/i.test(wrongPasswordMessage), wrongPasswordMessage);
    check("failed attempt recorded", (await db.user.findUnique({ where: { email: "parent@example.com" } }))?.failedLoginAttempts === 1);

    await page.fill('input[name="email"]', "nobody@example.com");
    await page.fill('input[name="password"]', "definitely wrong");
    await submitAndSettle(page);
    check("unknown account gives an identical message", (await alertText(page)) === wrongPasswordMessage);

    await page.fill('input[name="email"]', "PARENT@example.com"); // case-insensitive
    await page.fill('input[name="password"]', "a long enough password");
    await submitAndSettle(page);
    await page.waitForURL(`${BASE}/`);
    check("correct password signs in", page.url() === `${BASE}/`);
    check("failed attempts reset on success", (await db.user.findUnique({ where: { email: "parent@example.com" } }))?.failedLoginAttempts === 0);

    await submitAndSettle(page, 'button:has-text("Sign out")');
    await page.waitForURL(`${BASE}/login`);
    await page.goto(`${BASE}/profile`);
    check("signed-out user cannot reach /profile", page.url().includes("/login"), page.url());
    await page.close();
  }

  // ---- Changing a password revokes every other session -------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', "parent@example.com");
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
    await page.fill('input[name="email"]', "parent@example.com");
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
    await page.close();
  }
  // ---- Repeated failures lock the account --------------------------------
  // Runs last, and against Grandma, because it deliberately locks the account.
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`);

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await page.fill('input[name="email"]', "grandma@example.com");
      await page.fill('input[name="password"]', `wrong guess ${attempt}`);
      await submitAndSettle(page);
    }

    const locked = await db.user.findUnique({ where: { email: "grandma@example.com" } });
    check("account locks after repeated failures", (locked?.lockedUntil?.getTime() ?? 0) > Date.now());

    // Even the correct password is refused while the lock stands.
    await page.fill('input[name="email"]', "grandma@example.com");
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
