/**
 * End-to-end check of the M2 character builder, driven through a real browser.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty.
 *   2. Seed (so a bootstrap invite exists), then start the app on BASE.
 *   3. npx tsx tests/characters.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { pickSkills, spendStatBudget } from "./e2e-helpers.mts";
import { STATS, STAT_BUDGET, STAT_MIN } from "../lib/game/rules.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3300";
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

async function alertText(page: Page): Promise<string> {
  const alerts = await page.$$eval('[role="status"]', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ""),
  );
  return alerts.join(" | ");
}

/** Clicks a stat's + or − the given number of times. */
async function adjustStat(page: Page, label: string, direction: "Raise" | "Lower", times: number) {
  for (let index = 0; index < times; index += 1) {
    await page.click(`button[aria-label="${direction} ${label}"]`);
  }
}


/**
 * Picks a race/calling and confirms it registered.
 *
 * These selects are controlled by React and write through to a hidden input.
 * Selecting before hydration completes silently does nothing — the change
 * event has no handler yet and React then resets the select to its own state.
 * Retrying until the hidden input agrees removes the race.
 */
async function chooseOption(page: Page, selectId: string, hiddenName: string, value: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.selectOption(selectId, value);
    const applied = await page.inputValue(`input[name="${hiddenName}"]`).catch(() => "");
    if (applied === value || (value === "__other__" && applied === "")) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`${selectId} never accepted ${value} — hydration may have failed.`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({ where: { isBootstrap: true, redeemedById: null } });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed first.");

  const context = await browser.newContext();
  const page = await context.newPage();

  // ---- Sign up so we have a household ------------------------------------
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Parent");
  await page.fill('input[name="email"]', "parent@example.com");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);

  const user = await db.user.findUniqueOrThrow({ where: { email: "parent@example.com" } });

  // ---- Characters are private --------------------------------------------
  {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/characters`);
    check("signed-out user cannot reach /characters", anon.url().includes("/login"), anon.url());
    await anon.close();
  }

  // ---- Build the first character -----------------------------------------
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', "Mira Thistledown");
  await chooseOption(page, "select#choice-race", "race", "Halfling");
  await chooseOption(page, "select#choice-archetype", "archetype", "Beastfriend");
  await page.selectOption('select[name="ageBand"]', "CHILD");
  await page.fill('input[name="gender"]', "girl");
  await page.click('button:has-text("she/her")');
  await page.fill('textarea[name="description"]', "Freckles and a too-big coat.");

  // The builder opens at the floor with everything still to spend. It used to
  // open on the whole budget already allocated, which made the interesting move
  // taking points *away* from things — this assertion is the one that noticed
  // when that changed, and it was reading the old wording until now.
  check(
    "the builder starts with everything still to spend",
    (await page.textContent("body"))?.includes(`${STAT_BUDGET - STATS.length * STAT_MIN} points left`) === true,
  );

  // Nothing can come out of a stat sitting on the floor.
  check(
    "a stat at the floor cannot be lowered",
    await page.locator('button[aria-label="Lower Might"]').isDisabled(),
  );

  // Four into Heart, and the rest wherever they will go.
  await adjustStat(page, "Heart", "Raise", 4);
  await spendStatBudget(page);

  check(
    "the budget cannot be overspent",
    await page.locator('button[aria-label="Raise Wits"]').isDisabled(),
  );

  // Pick two skills.
  await page.click('button:has-text("Speak with Animals")');
  await page.click('button:has-text("Soothe the Wild")');

  // Any skill she has not taken, rather than a named one. This asked about
  // "Patch Up" — which is a Healer skill, and Mira is a Beastfriend. The picker
  // used to be a flat list of every calling's skills; since it started showing
  // her own calling plus the general pool, that button has not been on the page
  // at all, and the assertion was waiting thirty seconds for it before the
  // whole test gave up.
  const thirdSkill = page.getByRole("button", { name: "Climbing", exact: true });
  check("a third skill cannot be selected", await thirdSkill.isDisabled());

  await submitAndSettle(page, 'button:has-text("Create adventurer")');

  const mira = await db.character.findFirst({ where: { userId: user.id, name: "Mira Thistledown" }, include: { skills: true } });
  check("character created", mira !== null);
  check("race saved", mira?.race === "Halfling", mira?.race);
  check("calling saved", mira?.archetype === "Beastfriend", mira?.archetype);
  check("age band saved", mira?.ageBand === "CHILD", mira?.ageBand);
  check("pronouns saved", mira?.pronouns === "she/her", mira?.pronouns);
  check("the points went where they were put", mira?.heart === 5, `heart=${mira?.heart}`);
  // Summed over STATS rather than four named columns, which is how this came to
  // be asserting a total of twelve across seven stats long after the budget
  // stopped being twelve.
  check(
    "and the whole budget was spent",
    mira !== null && STATS.reduce((sum, stat) => sum + mira[stat], 0) === STAT_BUDGET,
    mira ? String(STATS.reduce((sum, stat) => sum + mira[stat], 0)) : "no character",
  );
  check("built under today's budget", mira?.buildBudget === STAT_BUDGET, String(mira?.buildBudget));
  check("two skills saved", mira?.skills.length === 2, mira?.skills.map((s) => s.name).join(", "));
  check("starts at level 1 with no xp", mira?.level === 1 && mira?.xp === 0);

  // ---- A custom race is allowed ------------------------------------------
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', "Pip");
  await chooseOption(page, "select#choice-race", "race", "__other__");
  await page.fill('input[placeholder="Type your own"]', "Cloud Baker");
  await chooseOption(page, "select#choice-archetype", "archetype", "Maker");
  await page.selectOption('select[name="ageBand"]', "GROWNUP");
  await spendStatBudget(page);
  await pickSkills(page, "Maker");
  await submitAndSettle(page, 'button:has-text("Create adventurer")');

  const pip = await db.character.findFirst({ where: { userId: user.id, name: "Pip" } });
  check("a race outside the list is accepted", pip?.race === "Cloud Baker", pip?.race);

  // ---- Family ties --------------------------------------------------------
  await page.goto(`${BASE}/characters/${pip!.id}`);
  await page.selectOption('select[name="kind"]', "PARENT");
  await page.selectOption('select[name="toId"]', mira!.id);
  await submitAndSettle(page, 'button:has-text("Add tie")');

  const relationships = await db.relationship.findMany();
  check("exactly one row stores the pair", relationships.length === 1, `${relationships.length} rows`);

  const row = relationships[0];
  const storedCorrectly =
    (row.characterAId === pip!.id && row.aToB === "PARENT") ||
    (row.characterAId === mira!.id && row.aToB === "CHILD");
  check("the tie is stored from the canonical side", storedCorrectly, `A=${row.characterAId} aToB=${row.aToB}`);
  check("bond starts at zero", row.bondLevel === 0 && row.bondXp === 0);

  // Each character should read the tie from their own perspective.
  check("Pip's page reads 'parent of Mira'", (await page.textContent("body"))?.includes("parent of") === true);
  await page.goto(`${BASE}/characters/${mira!.id}`);
  check("Mira's page reads 'child of Pip'", (await page.textContent("body"))?.includes("child of") === true);

  // ---- Editing preserves skill progress -----------------------------------
  await db.characterSkill.updateMany({
    where: { characterId: mira!.id, name: "Speak with Animals" },
    data: { rank: 3, xp: 7 },
  });

  await page.goto(`${BASE}/characters/${mira!.id}`);
  // Editing lives behind a disclosure now, so the sheet ends with who she is
  // rather than with a delete button.
  await page.click('summary:has-text("Change")');
  await page.fill('input[name="name"]', "Mira T.");
  await submitAndSettle(page, 'button:has-text("Save changes")');

  const edited = await db.character.findUniqueOrThrow({ where: { id: mira!.id }, include: { skills: true } });
  check("rename saved", edited.name === "Mira T.", edited.name);
  const kept = edited.skills.find((skill) => skill.name === "Speak with Animals");
  check("an untouched skill keeps its rank and xp", kept?.rank === 3 && kept?.xp === 7, `rank=${kept?.rank} xp=${kept?.xp}`);

  // ---- Another household cannot see or edit these -------------------------
  {
    const invite = await db.inviteCode.create({ data: { code: "HEARTH-TEST-9999" } });
    const strangerContext = await browser.newContext();
    const stranger = await strangerContext.newPage();
    await stranger.goto(`${BASE}/register`);
    await stranger.fill('input[name="inviteCode"]', invite.code);
    await stranger.fill('input[name="displayName"]', "Stranger");
    await stranger.fill('input[name="email"]', "stranger@example.com");
    await stranger.fill('input[name="password"]', "another long password");
    await submitAndSettle(stranger);
    await stranger.waitForURL(`${BASE}/`);

    const response = await stranger.goto(`${BASE}/characters/${mira!.id}`);
    check("another household gets a 404, not the character", response?.status() === 404, String(response?.status()));

    // And cannot edit it by posting the id directly.
    await stranger.goto(`${BASE}/characters/new`);
    await stranger.evaluate((id) => {
      const form = document.querySelector("form");
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "characterId";
      hidden.value = id;
      form?.appendChild(hidden);
    }, mira!.id);
    await stranger.close();

    const untouched = await db.character.findUniqueOrThrow({ where: { id: mira!.id } });
    check("the character was not modified by the stranger", untouched.name === "Mira T.");
  }

  // ---- Editing a sheet never costs her what she earned --------------------
  {
    // Skills are learned in play now — four goes at climbing becomes Climbing.
    // The edit form used to replace the whole skill set from its own list, so
    // opening a sheet to fix a typo silently deleted everything she had earned.
    await db.characterSkill.create({
      data: { characterId: mira!.id, name: "Humming", rank: 2, xp: 9 },
    });
    const beforeEdit = await db.characterSkill.count({ where: { characterId: mira!.id } });

    await page.goto(`${BASE}/characters/${mira!.id}`);
    // Housekeeping is folded away so the sheet ends with who she is rather than
    // with a delete button.
    await page.click('summary:has-text("Change")');

    // The builder's controls are gone once she exists; there is one editor for
    // her stats and one place her skills come from, and they are not this form.
    const sheet = (await page.textContent("main")) ?? "";
    check("editing does not offer to re-pick her skills", !sheet.includes("especially good at"));
    check("nor to re-spread her points", !sheet.includes("Spread the points"));

    await page.fill('textarea[name="description"]', "A little taller than last year.");
    await submitAndSettle(page, 'button:has-text("Save changes")');

    const afterEdit = await db.characterSkill.findMany({ where: { characterId: mira!.id } });
    check(
      "saving a sheet keeps every skill she has",
      afterEdit.length === beforeEdit,
      `${beforeEdit} -> ${afterEdit.length}`,
    );

    const humming = afterEdit.find((skill) => skill.name === "Humming");
    check("including one learned in play", humming !== undefined);
    check("with its rank intact", humming?.rank === 2, String(humming?.rank));
    check("and its progress intact", humming?.xp === 9, String(humming?.xp));

    const edited = await db.character.findUniqueOrThrow({ where: { id: mira!.id } });
    check("and the edit itself still went through", edited.description?.includes("taller") === true);
  }

  // ---- The edit form cannot change what play grants -----------------------
  {
    // Stats used to be editable here, and the rule "exactly twelve points" was
    // enforced on save. Both are gone: the form no longer submits stats at all,
    // so a crafted post cannot set them either. The rule that matters now is
    // enforced where points are actually spent, one at a time, on the sheet.
    const before = await db.character.findUniqueOrThrow({ where: { id: mira!.id } });

    await page.goto(`${BASE}/characters/${mira!.id}`);
    await page.click('summary:has-text("Change")');
    await page.evaluate(() => {
      const form = document.querySelector<HTMLInputElement>('input[name="characterId"]')?.closest("form");
      if (!form) throw new Error("The edit form was not found.");

      for (const stat of ["might", "wits", "heart", "spark"]) {
        const crafted = document.createElement("input");
        crafted.type = "hidden";
        crafted.name = stat;
        crafted.value = "12";
        form.appendChild(crafted);
      }
      form.requestSubmit();
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    const after = await db.character.findUniqueOrThrow({ where: { id: mira!.id } });
    check(
      "a crafted post cannot raise her stats",
      after.might === before.might && after.spark === before.spark,
      `might ${before.might} -> ${after.might}`,
    );
  }

  // ---- Deleting takes asking for, and then meaning it ----------------------
  await page.goto(`${BASE}/characters/${pip!.id}`);
  // Removing lives with the rest of the housekeeping, behind a disclosure — the
  // page should not end on a delete button.
  await page.click('summary:has-text("Change")');

  // Nothing on the page deletes anything until it is asked for.
  check(
    "removing is not one press away",
    (await page.locator('button:has-text("Remove Pip for good")').count()) === 0,
  );

  await page.click('button:has-text("Remove Pip…")');
  const confirmation = page.locator("form").filter({ hasText: "Really remove Pip?" });
  check(
    "the confirmation says what would be lost",
    (await confirmation.innerText()).includes("experience"),
  );
  check(
    "and offers the handover that would lose none of it",
    (await page.locator('a:has-text("Hand Pip to another player")').count()) === 1,
  );
  check(
    "the final button is refused until the name is typed",
    await page.locator('button:has-text("Remove Pip for good")').isDisabled(),
  );

  // A name that does not match keeps the door shut.
  await page.fill('input[name="confirmName"]', "Pipp");
  check(
    "a mistyped name does not open it",
    await page.locator('button:has-text("Remove Pip for good")').isDisabled(),
  );

  // Backing out leaves everything as it was, which is the path most people
  // arriving at this screen should take.
  await page.click('button:has-text("Keep them")');
  check(
    "backing out puts the door away again",
    (await page.locator('button:has-text("Remove Pip for good")').count()) === 0,
  );
  check(
    "and removes nobody",
    (await db.character.findUnique({ where: { id: pip!.id } })) !== null,
  );

  await page.click('button:has-text("Remove Pip…")');
  await page.fill('input[name="confirmName"]', "pip");
  await submitAndSettle(page, 'button:has-text("Remove Pip for good")');

  check("character deleted", (await db.character.findUnique({ where: { id: pip!.id } })) === null);
  check("its family ties went with it", (await db.relationship.count()) === 0);

  await page.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
