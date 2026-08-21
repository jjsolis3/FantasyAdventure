/**
 * The number on the front of the sheet, and the form that can change it.
 *
 * ## Why this needs a browser
 *
 * Both claims here are about what a person sees, and neither can be made by a
 * unit test. `levelReached` was always right; what was wrong is that two of the
 * three screens drawing a level never called it. A rule can be correct in every
 * test in the suite and still reach nobody, and the only way to catch that is
 * to open the pages and read them.
 *
 * ## The two claims
 *
 * **One level, everywhere.** The ladder was made four times steeper, and every
 * writer of `Character.level` was moved onto the high-water mark so that nobody
 * already playing lost anything. The components that only *display* a level
 * were not, so an adventurer ahead of the curve had two levels on screen at
 * once — his own sheet said 4, which is what his knacks were granted under, and
 * the list linking to it said 2. A household found this by hand.
 *
 * **A form somebody can get out of.** The reset opens on a legal spread, so
 * redistributing means taking points off before putting them on. Somebody doing
 * that to all seven ends at the floor, twelve points loose, with a button that
 * will not press and, until now, no word anywhere near it about why.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. Start the app.
 *   3. npx tsx tests/levels.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mts";
import { POINTS_TO_SPEND, STAT_INFO, STATS, levelFor } from "../lib/game/rules.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@localhost:5432/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  const context = await browser.newContext();
  const page = await context.newPage();

  // The first household through the door is the administrator, which is what
  // the reset screen needs.
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Dad");
  await page.fill('input[name="email"]', "dad@example.test");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);

  await buildCharacter(page, "Orin", "Elf", "Wondersmith", { pronouns: "he/him" });

  // Ahead of the curve, exactly as a real adventurer came to be: levelled under
  // the old ladder, then the ladder moved underneath him. 58 experience buys
  // level 2 today; he had already reached 4 and keeps it.
  const orin = await db.character.findFirstOrThrow({ where: { name: "Orin" } });
  await db.character.update({ where: { id: orin.id }, data: { level: 4, xp: 58 } });
  check("the curve alone would call him level 2", levelFor(58) === 2);

  // ---- One level, everywhere ------------------------------------------------
  await page.goto(`${BASE}/characters`);
  await page.waitForLoadState("networkidle");
  const badge = await page
    .getByRole("img", { name: /^Level \d/ })
    .first()
    .getAttribute("aria-label");
  check(
    "the household list shows the level he actually reached",
    /^Level 4\b/.test(badge ?? ""),
    badge ?? "no badge found",
  );

  await page.goto(`${BASE}/characters/${orin.id}`);
  await page.waitForLoadState("networkidle");
  const sheet = await page.locator("text=/^Level \\d+$/i").first().textContent();
  check("and his own sheet agrees with the list", (sheet ?? "").includes("4"), sheet?.trim());

  // Ahead of the curve means none of the way to the next one — not a negative
  // arc, which is what the ring drew before the clamp.
  check(
    "with no progress yet toward the next one, rather than a ring running backwards",
    /0 of \d+ toward level 5/.test(badge ?? ""),
    badge ?? "",
  );

  // ---- A form somebody can get out of ---------------------------------------
  await page.goto(`${BASE}/settings/adventurers/${orin.id}`);
  await page.waitForLoadState("networkidle");

  const submit = page.locator('button[type="submit"]').last();
  check("the reset opens on a legal spread, ready to press", !(await submit.isDisabled()));

  // Take every stat to the floor, the way somebody redistributing all seven
  // would. Four passes is more than enough to empty a build capped at five.
  for (let pass = 0; pass < 5; pass += 1) {
    for (const stat of STATS) {
      const minus = page.getByRole("button", { name: `Lower ${STAT_INFO[stat].label}` });
      if (await minus.isEnabled()) await minus.click();
    }
  }

  check("emptying it leaves the whole budget unplaced", await submit.isDisabled());

  const why = await page.locator(`text=/turns on once all ${POINTS_TO_SPEND} are spent/`).first();
  check(
    "and the button says why, beside the button rather than half a page above it",
    await why.isVisible(),
    (await why.textContent())?.trim(),
  );

  await page.getByRole("button", { name: /suggested spread back/ }).click();
  const settled = await page.locator(`text=/All ${POINTS_TO_SPEND} spent/`).first().textContent();
  check("one press puts a legal spread back", /All \d+ spent/.test(settled ?? ""), settled?.trim());
  check("which lets it press again", !(await submit.isDisabled()));

  // And the safe mode really is safe: it keeps the level it was told to keep.
  await submitAndSettle(page, 'input[name="confirmName"]').catch(() => {});
  await page.fill('input[name="confirmName"]', "Orin");
  await submit.click();
  await page.waitForLoadState("networkidle");

  const after = await db.character.findUniqueOrThrow({ where: { id: orin.id } });
  check("re-laying his numbers leaves the level alone", after.level === 4, `level ${after.level}`);
  check("and the experience alone", after.xp === 58, `${after.xp} experience`);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
