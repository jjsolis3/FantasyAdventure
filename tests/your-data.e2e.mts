/**
 * Taking a copy, and leaving.
 *
 * The two obligations that arrive with charging money for something children
 * write in: a family can have all of it back, and a family can go.
 *
 * What is asserted here:
 *
 *   1. The export really contains the story — not a manifest of what exists, but
 *      the narration itself, turn by turn. An export that downloads and is empty
 *      is worse than none, because it looks like it worked.
 *   2. **Nothing that grants access is in it.** Password hashes above all. This
 *      is a file that ends up in a downloads folder and on a memory stick.
 *   3. Another family cannot get it, and the URL carries nothing to tamper with.
 *   4. Closing a family really removes it — **checked against every table in the
 *      database rather than the handful I would have thought to name.** Four
 *      tables hold a `sceneId` with no foreign key behind it, which is exactly
 *      the shape of bug that leaves rows behind after a delete, and the only
 *      honest way to know is to look at all of them.
 *   5. A linked family's own adventure survives, because it was never this
 *      family's to end.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/your-data.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, inviteInto, submitAndSettle } from "./e2e-helpers.mjs";

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
// matched *brambles* in `prisma/storylines.ts`. Grep before adding one.
const OPERATOR = "Halbrick";
const OWNER = "Quenby";
const CHILD = "Wrenna";
const SAID = "Tamsyn kicks the lantern into the well";

async function register(page: Page, code: string, name: string, email: string) {
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', code);
  await page.fill('input[name="displayName"]', name);
  await page.fill('input[name="handle"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
}

async function signedInPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="handle"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
  return page;
}

/** Every table in the schema, asked of the database rather than remembered. */
async function tableNames(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map((row) => row.tablename).filter((name) => name !== "_prisma_migrations");
}

/** How many rows each table holds, so before and after can be compared. */
async function countEverything(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await tableNames()) {
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${table}"`,
    );
    counts[table] = Number(row?.n ?? 0);
  }
  return counts;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirstOrThrow({
    where: { isBootstrap: true, redeemedById: null },
  });

  console.log("\n-- Two families, and only one of them closing -----------------------");

  // The operator's own family, which survives. It is deliberately *not* the one
  // that closes: `mayCloseHousehold` refuses somebody who runs the installation
  // on this screen, so a test that closed the first account would be testing
  // the refusal rather than the deletion. (Found by writing it the other way
  // round first.)
  const operator = await (await browser.newContext()).newPage();
  await register(operator, bootstrap.code, OPERATOR, "halbrick@example.test");
  await buildCharacter(operator, "Merrow", "Human", "Guardian");

  const operatorUser = await db.user.findUniqueOrThrow({
    where: { email: "halbrick@example.test" },
    select: { id: true, households: { select: { householdId: true } } },
  });
  const operatorHousehold = operatorUser.households[0]!.householdId;

  await operator.goto(`${BASE}/admin/invites`);
  await operator.selectOption('select[name="grant"]', "NEW_HOUSEHOLD");
  await operator.fill('input[name="forName"]', "The family that leaves");
  await submitAndSettle(operator);
  await operator.waitForSelector("text=The family that leaves");
  const familyCode = (await operator.locator("code").first().textContent())!.trim();

  // The family that closes. An ordinary household that administers nothing.
  const owner = await (await browser.newContext()).newPage();
  await register(owner, familyCode, OWNER, "quenby@example.test");
  await buildCharacter(owner, "Tamsyn", "Halfling", "Beastfriend");

  const ownerUser = await db.user.findUniqueOrThrow({
    where: { email: "quenby@example.test" },
    select: { id: true, households: { select: { householdId: true } } },
  });
  const household = ownerUser.households[0]!.householdId;
  const householdName = (
    await db.household.findUniqueOrThrow({ where: { id: household }, select: { name: true } })
  ).name;

  // A child with a sign-in of her own, so closing the family is visibly the end
  // of a person's login rather than of a row — and so the export contains
  // somebody whose account holds no email address at all.
  const { code } = await inviteInto(db, {
    householdId: household,
    createdById: ownerUser.id,
    role: "MEMBER",
    forName: CHILD,
  });
  const child = await (await browser.newContext()).newPage();
  await child.goto(`${BASE}/register`);
  await child.fill('input[name="inviteCode"]', code);
  await child.fill('input[name="displayName"]', CHILD);
  await child.selectOption('select[name="handleKind"]', "username");
  await child.fill('input[name="handle"]', "wrenna");
  await child.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(child);
  await child.waitForURL(`${BASE}/`);

  // An adventure with real narration in it, written straight through Prisma:
  // the point is that the *export* carries the story, and playing a turn for
  // real would need a model server this test does not want.
  const storyline = await db.storyline.findFirstOrThrow({ where: { isActive: true } });
  const character = await db.character.findFirstOrThrow({ where: { householdId: household } });
  const campaign = await db.campaign.create({
    data: {
      ownerId: ownerUser.id,
      householdId: household,
      storylineId: storyline.id,
      title: "The evening in question",
      tone: "COZY",
      readingLevel: "FAMILY_MIXED",
      joinCode: `PARTY-DATA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      party: { create: [{ characterId: character.id, position: 0 }] },
      scenes: {
        create: [
          {
            index: 1,
            title: "The well",
            location: "The village green",
            status: "OPEN",
            turns: { create: [{ ordinal: 1, type: "NARRATION", content: SAID }] },
          },
        ],
      },
    },
    select: { id: true },
  });

  // And an adventure belonging to the family that stays, which one of the
  // leaving family's adventurers is travelling in. It is not theirs to end.
  const operatorCharacter = await db.character.findFirstOrThrow({
    where: { householdId: operatorHousehold },
  });
  const survivingCampaign = await db.campaign.create({
    data: {
      ownerId: operatorUser.id,
      householdId: operatorHousehold,
      storylineId: storyline.id,
      title: "An evening that belongs to somebody else",
      tone: "COZY",
      readingLevel: "FAMILY_MIXED",
      joinCode: `PARTY-STAY-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      party: {
        create: [
          { characterId: operatorCharacter.id, position: 0 },
          { characterId: character.id, position: 1 },
        ],
      },
    },
    select: { id: true },
  });

  console.log("\n-- The copy has the story in it -----------------------------------");

  const download = await owner.request.get(`${BASE}/api/settings/export`);
  check("the export downloads", download.ok(), String(download.status()));
  check(
    "as a file rather than a page",
    (download.headers()["content-disposition"] ?? "").includes("attachment"),
    download.headers()["content-disposition"] ?? "none",
  );

  const raw = await download.text();
  const archive = JSON.parse(raw) as Record<string, unknown>;

  check("it says what it is", archive.format === "hearthlight-household-archive");
  check("the adventurers are in it", raw.includes("Tamsyn"));
  check("both sign-ins are in it", raw.includes(OWNER) && raw.includes(CHILD));

  // The assertion that matters. A manifest of what exists would pass every
  // check above and be worthless — what a family wants back is the narration.
  check("and the story itself, word for word", raw.includes(SAID));

  console.log("\n-- And nothing that could sign anybody in --------------------------");

  const hash = await db.user.findUniqueOrThrow({
    where: { id: ownerUser.id },
    select: { passwordHash: true },
  });
  check("no password hash", !raw.includes(hash.passwordHash));
  check("not even the word", !/passwordHash/.test(raw));

  const session = await db.authSession.findFirstOrThrow({
    where: { userId: ownerUser.id },
    select: { tokenHash: true },
  });
  check("no session token", !raw.includes(session.tokenHash));
  check("and it says out loud what it left out", Array.isArray(archive.withheld));

  console.log("\n-- One family's copy is not another's ------------------------------");

  const theirs = await operator.request.get(`${BASE}/api/settings/export`);
  const theirRaw = await theirs.text();
  check("the other family's export is their own", !theirRaw.includes("Tamsyn"));
  check("and does not carry our story", !theirRaw.includes(SAID));

  console.log("\n-- Closing the family ---------------------------------------------");

  const childPage = await (await browser.newContext()).newPage();
  await childPage.goto(`${BASE}/login`);
  await childPage.click('button:has-text("I sign in with a username")');
  await childPage.fill('input[name="handle"]', "wrenna");
  await childPage.fill('input[name="password"]', PASSWORD);
  await submitAndSettle(childPage);
  await childPage.goto(`${BASE}/settings/your-data`);
  check(
    "somebody who only plays cannot reach the screen at all",
    !childPage.url().includes("your-data"),
    childPage.url(),
  );

  // Whoever runs the installation is refused here too, on purpose — this is the
  // one place `everywhere` takes a power away rather than granting one.
  await operator.goto(`${BASE}/settings/your-data`);
  check(
    "and neither can whoever runs the installation, from this screen",
    (await operator.locator('input[name="confirm"]').count()) === 0,
  );

  const before = await countEverything();

  const ownerAgain = await signedInPage(browser, "quenby@example.test");
  await ownerAgain.goto(`${BASE}/settings/your-data`);

  // The wrong name, forced past the disabled button. The button being held shut
  // is a courtesy; `mayCloseHousehold` is the defence, and this is the only way
  // to see it do its job.
  await ownerAgain.fill('input[name="confirm"]', "The Okonkwo family");
  await ownerAgain.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[type="submit"]')?.removeAttribute("disabled");
  });
  await submitAndSettle(ownerAgain);
  check(
    "a wrong name is refused by the server, not just by the button",
    (await db.household.count({ where: { id: household } })) === 1,
  );

  await ownerAgain.fill('input[name="confirm"]', householdName);
  await submitAndSettle(ownerAgain);

  check("the family is closed", (await db.household.count({ where: { id: household } })) === 0);
  check(
    "and every sign-in in it went with it",
    (await db.user.count({ where: { id: ownerUser.id } })) === 0,
  );
  check(
    "including the child's, who had no email to lose",
    (await db.user.count({ where: { username: "wrenna" } })) === 0,
  );
  check(
    "their adventure is gone",
    (await db.campaign.count({ where: { id: campaign.id } })) === 0,
  );

  console.log("\n-- And nothing was left behind ------------------------------------");

  const after = await countEverything();

  // Scenes and turns belonged to exactly one adventure, and that adventure is
  // gone. Anything left is a row that outlived its parent.
  const strandedScenes = await db.scene.count({ where: { campaignId: campaign.id } });
  check("no scene outlived the adventure it belonged to", strandedScenes === 0);

  // Every table with a `sceneId` and no foreign key behind it — which is
  // precisely the shape that survives a delete it should not have, and
  // precisely the set I would have missed by naming tables from memory.
  const orphanRows = await db.$queryRawUnsafe<{ table_name: string; n: bigint }[]>(`
    SELECT 'Encounter' AS table_name, count(*)::bigint AS n FROM "Encounter" e
      WHERE NOT EXISTS (SELECT 1 FROM "Scene" s WHERE s.id = e."sceneId")
    UNION ALL SELECT 'FamilyMoveUse', count(*)::bigint FROM "FamilyMoveUse" f
      WHERE NOT EXISTS (SELECT 1 FROM "Scene" s WHERE s.id = f."sceneId")
    UNION ALL SELECT 'ListeningBond', count(*)::bigint FROM "ListeningBond" l
      WHERE NOT EXISTS (SELECT 1 FROM "Scene" s WHERE s.id = l."sceneId")
    UNION ALL SELECT 'PendingRoll', count(*)::bigint FROM "PendingRoll" p
      WHERE NOT EXISTS (SELECT 1 FROM "Scene" s WHERE s.id = p."sceneId")
  `);
  const orphans = orphanRows.filter((row) => Number(row.n) > 0);
  check(
    "and the four tables with no foreign key on sceneId hold nothing orphaned",
    orphans.length === 0,
    orphans.map((row) => `${row.table_name}=${row.n}`).join(", ") || "none",
  );

  console.log("\n-- The family next door is untouched -------------------------------");

  check(
    "their adventure survives",
    (await db.campaign.count({ where: { id: survivingCampaign.id } })) === 1,
  );
  check("and so do they", (await db.user.count({ where: { id: operatorUser.id } })) === 1);
  check(
    "though the adventurer who travelled with them is gone",
    (await db.partyMember.count({ where: { campaignId: survivingCampaign.id } })) === 1,
    "their own is left",
  );
  check(
    "(and the database did not simply empty)",
    before.User > after.User && after.User > 0,
    `${before.User} → ${after.User}`,
  );
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
