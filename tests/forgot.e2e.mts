/**
 * Forgetting a password, and getting back in by email.
 *
 * The grown-ups' half of the answer. A child signs in with a username and holds
 * no address at all — that is the point of her account — so she is never emailed
 * and never could be; the grown-up next to her sets her password directly, which
 * `tests/people.e2e.mts` covers. This is everybody else.
 *
 * **No mail server is involved.** The token is minted through the very code the
 * action uses, so the test holds the plaintext the email would have carried and
 * can open the link with it. That keeps the test about what the link *does* —
 * which is the part with the security in it — rather than about SMTP, which is
 * configuration and would make this a test of the network.
 *
 * What is asserted:
 *
 *   1. Asking says the same thing whether or not the address has an account, so
 *      the form cannot be used to test which addresses are registered here.
 *   2. A live link sets the password, signs them straight in, and ends every
 *      session the account had.
 *   3. It works exactly once.
 *   4. An expired one is refused, and says so rather than "not recognised".
 *   5. A child's account is not reachable this way at all.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/forgot.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, householdOf, inviteInto, submitAndSettle } from "./e2e-helpers.mjs";
import { hashResetToken, makeResetToken } from "../lib/auth/password-reset.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5520/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const PASSWORD = "a long enough password";
const NEW_PASSWORD = "the heron on the wall";

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

async function signIn(handle: string, kind: "email" | "username", password: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  if (kind === "username") await page.click('button:has-text("I sign in with a username")');
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="password"]', password);
  await submitAndSettle(page);
  const landed = page.url() === `${BASE}/`;
  await page.close();
  return landed;
}

/**
 * Mints a link the way the action does, and stores it the way the action does.
 *
 * The plaintext never leaves this function in production — it goes into an
 * email — so a test that wants to follow the link has to make one.
 */
async function issueLink(userId: string, options: { expired?: boolean } = {}) {
  const { token, tokenHash, expiresAt } = makeResetToken();
  await db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await db.passwordResetToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt: options.expired ? new Date(Date.now() - 60_000) : expiresAt,
    },
  });
  return token;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  console.log("\n-- A grown-up and a child ---------------------------------------");

  const ownerPage = await (await browser.newContext()).newPage();
  await register(ownerPage, bootstrap.code, "Jose", "jose@example.com", "email");
  const owner = await db.user.findUniqueOrThrow({ where: { email: "jose@example.com" } });
  const home = await householdOf(db, owner.id);

  const forTamsyn = await inviteInto(db, { householdId: home, createdById: owner.id, role: "MEMBER" });
  const tamsynPage = await (await browser.newContext()).newPage();
  await register(tamsynPage, forTamsyn.code, "Tamsyn", "tamsyn", "username");
  const tamsyn = await db.user.findUniqueOrThrow({ where: { username: "tamsyn" } });

  console.log("\n-- Asking never says whether an address is registered ------------");

  const asking = await (await browser.newContext()).newPage();

  // `scripts/e2e.sh` points SMTP at a dead address, so the feature reads as
  // configured and nothing leaves the machine. If this assertion fails, the
  // harness stopped exporting it and every check below would be testing the
  // "off" screen instead of the real one.
  await asking.goto(`${BASE}/forgot`);
  check(
    "the harness has the feature switched on",
    (await asking.locator('input[name="email"]').count()) === 1,
    ((await asking.textContent("main")) ?? "").slice(0, 90),
  );

  for (const address of ["jose@example.com", "nobody@example.com"]) {
    await asking.goto(`${BASE}/forgot`);
    await asking.fill('input[name="email"]', address);
    await submitAndSettle(asking);
    const said = (await asking.textContent("main")) ?? "";
    check(`asking about ${address} gives the same answer`, said.includes("a link is on its way"));
  }

  // Only the real account got one. This is the half that makes the identical
  // wording meaningful rather than merely polite.
  check(
    "and only the address that exists got a link",
    (await db.passwordResetToken.count({ where: { userId: owner.id } })) === 1,
  );
  check("with nothing left for anyone else", (await db.passwordResetToken.count()) === 1);

  // A username typed here finds nothing, which is the right answer rather than
  // a special case: a child is not the person this form is for.
  await asking.goto(`${BASE}/forgot`);
  await asking.fill('input[name="email"]', "tamsyn");
  await submitAndSettle(asking);
  check(
    "a child's username gets the same sentence and no link",
    (await db.passwordResetToken.count({ where: { userId: tamsyn.id } })) === 0,
  );

  await asking.close();

  console.log("\n-- A live link sets the password and signs them in ---------------");

  // Two sessions on the account, so "every session ends" has something to end.
  await signIn("jose@example.com", "email", PASSWORD);
  const sessionsBefore = await db.authSession.count({ where: { userId: owner.id } });
  check("the account has sessions to lose", sessionsBefore >= 2, String(sessionsBefore));

  const token = await issueLink(owner.id);
  const follower = await (await browser.newContext()).newPage();
  await follower.goto(`${BASE}/reset/${encodeURIComponent(token)}`);
  check("the link opens a form", (await follower.locator('input[name="password"]').count()) === 1);

  await follower.fill('input[name="password"]', NEW_PASSWORD);
  await follower.fill('input[name="confirmPassword"]', NEW_PASSWORD);
  await submitAndSettle(follower);
  check("and signs them straight in", follower.url() === `${BASE}/`, follower.url());

  // Counted here rather than later, because every `signIn` below makes a
  // session of its own — a count taken after those would be measuring the test
  // rather than the reset. Both the old sessions are gone and the only one left
  // is the one this reset just created. If the reason for the reset was that
  // somebody else had got in, their session would otherwise have survived it.
  const sessionsAfter = await db.authSession.count({ where: { userId: owner.id } });
  check(
    "every session the account had is ended, bar the new one",
    sessionsAfter === 1,
    `${sessionsBefore} → ${sessionsAfter}`,
  );

  check("the new password works", await signIn("jose@example.com", "email", NEW_PASSWORD));
  check("and the old one does not", !(await signIn("jose@example.com", "email", PASSWORD)));

  const spent = await db.passwordResetToken.findUniqueOrThrow({
    where: { tokenHash: hashResetToken(token) },
  });
  check("the link is marked spent rather than deleted", spent.usedAt !== null);


  console.log("\n-- And it works exactly once ------------------------------------");

  const again = await (await browser.newContext()).newPage();
  await again.goto(`${BASE}/reset/${encodeURIComponent(token)}`);
  const saidTwice = (await again.textContent("main")) ?? "";
  check("a second click says it has been used", saidTwice.includes("already been used"), saidTwice.slice(0, 90));
  check("rather than the blank 'not recognised'", !saidTwice.includes("not recognised"));
  await again.close();

  console.log("\n-- An expired one is refused, and says which ---------------------");

  const stale = await issueLink(owner.id, { expired: true });
  const late = await (await browser.newContext()).newPage();
  await late.goto(`${BASE}/reset/${encodeURIComponent(stale)}`);
  const saidLate = (await late.textContent("main")) ?? "";
  check("it says expired", saidLate.includes("expired"), saidLate.slice(0, 90));
  check("and offers a new one", saidLate.includes("Ask for a new link"));
  await late.close();

  // The password is untouched by a refused link — the state check is not just
  // cosmetic on the page.
  check("and nothing was changed by it", await signIn("jose@example.com", "email", NEW_PASSWORD));

  console.log("\n-- A child's account is not reachable this way -------------------");

  check("she holds no address for a link to go to", tamsyn.email === null);
  const hers = await db.passwordResetToken.count({ where: { userId: tamsyn.id } });
  check("and no link has ever been made for her", hers === 0, String(hers));

  const childDoor = await (await browser.newContext()).newPage();
  await childDoor.goto(`${BASE}/login`);
  await childDoor.click('button:has-text("I sign in with a username")');
  const onUsernameSide = (await childDoor.locator('a:has-text("Forgotten your password?")').count()) === 0;
  check("the username side offers no reset link, because it would be a dead end", onUsernameSide);
  await childDoor.close();

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
} finally {
  await browser.close();
  await db.$disconnect();
}

process.exit(failures === 0 ? 0 : 1);
