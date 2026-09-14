/**
 * Households, and putting the right accounts in the right one.
 *
 * The case this replays is the one the migration deliberately refused to guess
 * at. A household where everybody has their own sign-in looks exactly like
 * three separate households from inside a database, so when households arrived
 * every account got one of its own. Somebody then has to say which of them are
 * actually one family — and until they do, a father and his two daughters are
 * three strangers to every privacy rule in the app.
 *
 * So the assertions here are about the two halves of that:
 *
 *   1. **Registering puts you in a household**, of your own, answering for it.
 *      An account outside every household cannot build an adventurer at all.
 *   2. **Moving an account takes everything it owns with it.** Its adventurers
 *      and its adventures cross the boundary too — leaving them behind would
 *      put a child's sheet in a family she is no longer part of, which is the
 *      exact leak all of this exists to prevent.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/households.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mjs";
import { generateInviteCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5520/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function register(page: Page, code: string, name: string, email: string) {
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', code);
  await page.fill('input[name="displayName"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
}

/** Which household an account is in, and what it may do there. */
async function membership(email: string) {
  return db.householdMember.findFirst({
    where: { user: { email } },
    include: { household: { select: { id: true, name: true } } },
  });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  console.log("\n-- Registering puts you in a household of your own ----------------");

  const dadContext = await browser.newContext();
  const dad = await dadContext.newPage();
  await register(dad, bootstrap.code, "Dad", "dad@example.com");

  const dadHome = await membership("dad@example.com");
  check("the first account has a household", dadHome !== null);
  check("named after them", dadHome?.household.name === "Dad's household", dadHome?.household.name);
  check("and answers for it", dadHome?.role === "OWNER", dadHome?.role);

  // A second family, admitted deliberately. This used to be what *every* code
  // did, because a code meant one thing; it is now a choice the person writing
  // the invitation makes, and only whoever runs the installation may make it.
  const code = await db.inviteCode.create({
    data: {
      code: generateInviteCode(),
      createdById: dadHome?.userId,
      grant: "NEW_HOUSEHOLD",
      forName: "Mira",
    },
  });

  const miraContext = await browser.newContext();
  const mira = await miraContext.newPage();
  await register(mira, code.code, "Mira", "mira@example.com");

  const miraHome = await membership("mira@example.com");
  check("the second account has one too", miraHome !== null);
  check(
    "and it is not the household that invited her",
    miraHome?.householdId !== dadHome?.householdId,
    `${miraHome?.household.name} vs ${dadHome?.household.name}`,
  );
  check(
    "she answers for the household she was sent to start",
    miraHome?.role === "OWNER",
    miraHome?.role,
  );

  console.log("\n-- Each of them can build an adventurer --------------------------");

  await buildCharacter(dad, "Orin", "Elf", "Wondersmith");
  await buildCharacter(mira, "Wren", "Fox-folk", "Healer");

  const orin = await db.character.findFirstOrThrow({ where: { name: "Orin" } });
  const wren = await db.character.findFirstOrThrow({ where: { name: "Wren" } });
  check(
    "and she is stamped with the household that built her",
    orin.householdId === dadHome?.householdId,
    `${orin.householdId} vs ${dadHome?.householdId}`,
  );
  check(
    "each to her own",
    wren.householdId === miraHome?.householdId && wren.householdId !== orin.householdId,
  );

  console.log("\n-- A player cannot reach the households screen -------------------");

  await mira.goto(`${BASE}/admin/households`);
  check(
    "it is administrators only",
    !mira.url().endsWith("/admin/households"),
    mira.url(),
  );

  console.log("\n-- The administrator makes one family of the two -----------------");

  await dad.goto(`${BASE}/admin/households`);
  await dad.waitForLoadState("networkidle");

  const listed = (await dad.textContent("main")) ?? "";
  check("both households are listed", listed.includes("Dad's household") && listed.includes("Mira's household"));
  check("with the code that would link them", /KIN-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(listed));

  // Name it for the family rather than for whoever registered first.
  await dad.fill('input[name="name"][placeholder="The Solis family"]', "The Solis family");
  await dad.click('button:has-text("Make a household")');
  await dad.waitForSelector('text=/is ready/', { timeout: 10_000 });

  const solis = await db.household.findFirstOrThrow({ where: { name: "The Solis family" } });
  check("a household can be started for the family itself", solis !== null);

  // Move both accounts into it, one at a time, the way a person would.
  for (const who of ["dad@example.com", "mira@example.com"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: who } });
    await dad.goto(`${BASE}/admin/households`);
    await dad.waitForLoadState("networkidle");
    await dad.selectOption('select[name="userId"]', user.id);
    await dad.selectOption('select[name="householdId"]', solis.id);
    await dad.click('button:has-text("Move them")');
    await dad.waitForSelector(`text=/is now in The Solis family/`, { timeout: 10_000 });
  }

  const dadAfter = await membership("dad@example.com");
  const miraAfter = await membership("mira@example.com");
  check("both accounts are in it", dadAfter?.householdId === solis.id && miraAfter?.householdId === solis.id);
  check(
    "which is the whole point — they are one family now",
    dadAfter?.householdId === miraAfter?.householdId,
  );

  console.log("\n-- And their adventurers came with them --------------------------");

  const [orinAfter, wrenAfter] = await Promise.all([
    db.character.findUniqueOrThrow({ where: { id: orin.id } }),
    db.character.findUniqueOrThrow({ where: { id: wren.id } }),
  ]);
  check(
    "his adventurer moved too",
    orinAfter.householdId === solis.id,
    `${orinAfter.householdId} vs ${solis.id}`,
  );
  check(
    "and hers",
    wrenAfter.householdId === solis.id,
    `${wrenAfter.householdId} vs ${solis.id}`,
  );
  check(
    "and neither changed hands — moving house is not a handover",
    orinAfter.userId === orin.userId && wrenAfter.userId === wren.userId,
  );

  console.log("\n-- The households nobody is left in are tidied away --------------");

  const emptied = await db.household.count({
    where: { id: { in: [dadHome?.householdId ?? "", miraHome?.householdId ?? ""] } },
  });
  check("the two one-person households are gone", emptied === 0, `${emptied} left`);

  const everyone = await db.user.count({ where: { households: { none: {} } } });
  check("and nobody was left outside a household", everyone === 0, `${everyone} stranded`);

  check(
    "the first one in takes charge, so the family is never left unable to act",
    dadAfter?.role === "OWNER",
    dadAfter?.role,
  );
  check("and the one who followed only plays", miraAfter?.role === "MEMBER", miraAfter?.role);

  console.log("\n-- One family's parent cannot touch another's adventurer ---------");

  // A third household, outside the Solis family entirely — the friend's family,
  // in so many words, which is what all of this is being built for.
  const strangerCode = await db.inviteCode.create({
    data: {
      code: generateInviteCode(),
      createdById: dadAfter?.userId,
      grant: "NEW_HOUSEHOLD",
      forName: "Someone else",
    },
  });
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await register(stranger, strangerCode.code, "Someone Else", "stranger@example.com");

  // The screen refuses to show her — not found rather than forbidden, because a
  // 403 would confirm that the id belongs to somebody.
  await stranger.goto(`${BASE}/settings/adventurers/${orin.id}`);
  const strangerSees = (await stranger.textContent("body")) ?? "";
  check(
    "another family's reset screen is not found",
    !strangerSees.includes("Orin"),
    stranger.url(),
  );

  // She cannot see the list either — the one that had no `where` clause at all
  // and returned every adventurer in the installation.
  await stranger.goto(`${BASE}/settings/adventurers`);
  const strangerList = (await stranger.textContent("main")) ?? "";
  check(
    "nor find them on her own family's list",
    !strangerList.includes("Orin") && !strangerList.includes("Wren"),
    strangerList.replace(/\n+/g, " / ").slice(0, 120),
  );

  // The reset action's own refusal is *not* asserted here. Hand-posting to that
  // URL gets a 404 from Next before any of our code runs — server actions want
  // a header a raw POST has not got — so a check on it would pass whether the
  // guard existed or not, which is the worst kind of green. The rule itself is
  // `mayTouch`, exhaustively covered in `tests/households.test.ts`, and it is
  // the same function both this screen and the action call.

  console.log("\n-- A parent invites a child into their own house -----------------");

  await dad.goto(`${BASE}/settings/invites`);
  await dad.waitForLoadState("networkidle");
  await dad.fill('input[name="forName"]', "Bea");
  await dad.selectOption('select[name="grant"]', "HOUSEHOLD_MEMBER");
  await dad.selectOption('select[name="intendedRole"]', "MEMBER");
  await dad.click('button:has-text("Create invite code")');
  await dad.waitForSelector("text=/Invite created/", { timeout: 10_000 });

  const forBea = await db.inviteCode.findFirstOrThrow({
    where: { forName: "Bea" },
    orderBy: { createdAt: "desc" },
  });
  check("the code is written for this house", forBea.householdId === solis.id, forBea.householdId ?? "none");
  check("and says so", forBea.grant === "HOUSEHOLD_MEMBER", forBea.grant);
  check("and says she plays", forBea.intendedRole === "MEMBER", forBea.intendedRole ?? "none");

  const beaContext = await browser.newContext();
  const bea = await beaContext.newPage();
  await register(bea, forBea.code, "Bea", "bea@example.com");

  const beaHome = await membership("bea@example.com");
  check(
    "redeeming it lands her in the family, not in a household of her own",
    beaHome?.householdId === solis.id,
    `${beaHome?.household.name}`,
  );
  check("as somebody who plays", beaHome?.role === "MEMBER", beaHome?.role);

  const solisCount = await db.householdMember.count({ where: { householdId: solis.id } });
  check("three of them, one family", solisCount === 3, String(solisCount));

  console.log("\n-- Only whoever runs Hearthlight may admit a family --------------");

  check("the operator is offered the choice", (await dad.locator('select[name="grant"]').count()) === 1);

  await stranger.goto(`${BASE}/settings/invites`);
  await stranger.waitForLoadState("networkidle");
  check(
    "another family's parent is not",
    (await stranger.locator('select[name="grant"]').count()) === 0,
  );

  // And hiding the menu is a courtesy, not the defence. This posts the grant
  // anyway — through the real form, so it carries the headers a server action
  // insists on and actually reaches our code, unlike a raw `request.post`.
  await stranger.evaluate(() => {
    const form = document.querySelector("form input[name='forName']")?.closest("form");
    const hidden = form?.querySelector<HTMLInputElement>("input[name='grant']");
    if (hidden) hidden.value = "NEW_HOUSEHOLD";
  });
  await stranger.fill('input[name="forName"]', "A whole new family");
  await stranger.click('button:has-text("Create invite code")');
  await stranger.waitForSelector("text=/runs Hearthlight/", { timeout: 10_000 });

  const smuggled = await db.inviteCode.count({ where: { forName: "A whole new family" } });
  check("the server refuses it whatever the form said", smuggled === 0, `${smuggled} written`);

  console.log("\n-- And one family's codes are not another's to see ---------------");

  const strangerCodes = (await stranger.textContent("main")) ?? "";
  check(
    "she sees neither the family's code nor the bootstrap one",
    !strangerCodes.includes(forBea.code) && !strangerCodes.includes(bootstrap.code),
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
} finally {
  await browser.close();
  await db.$disconnect();
}

process.exit(failures === 0 ? 0 : 1);
