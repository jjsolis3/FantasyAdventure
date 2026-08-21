/**
 * The bits every browser test needs, in one place.
 *
 * ## Why this exists
 *
 * Nine end-to-end tests carried a byte-identical `buildCharacter` helper, and
 * one day the builder grew a stat allocator and a skill picker and started
 * refusing forms without them. All nine broke at once, in the worst possible
 * way: the form posted, the server refused it, no adventurer was created, and
 * the failure surfaced dozens of lines later as *"No record was found for a
 * query"* on something that looked unrelated.
 *
 * Because `npm run test:e2e` chains them with `&&`, the third one failing meant
 * the twelve after it never ran at all. The browser-level safety net had been
 * off for a while, and the way it came to light was a family finding four bugs
 * on the reset screen by hand.
 *
 * So: one definition. When the builder changes again — and it will — this is
 * the single file that has to keep up.
 *
 * ## What "fill in the builder" means now
 *
 * Three things, and the last two are the ones that were missing:
 *
 *   - a name, a race and a calling;
 *   - the whole stat budget spent, because the form is refused below it;
 *   - the skills, because the builder hands out two and the server takes them.
 *
 * Both are done by driving the real controls rather than by posting values, so
 * these tests keep testing the thing a child actually uses.
 */
import type { Page } from "@playwright/test";
import { findArchetype } from "../lib/game/character-options.ts";
import { SKILLS_PER_CHARACTER } from "../lib/game/rules.ts";

export const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3399";

/** Clicks a submit and waits for the page to stop moving. */
export async function submitAndSettle(page: Page, selector = 'button[type="submit"]') {
  await page.waitForSelector(`${selector}:not([disabled])`);
  await page.click(selector);
  await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Picks a race or calling and confirms it registered.
 *
 * These selects are controlled by React and write through to a hidden input.
 * Selecting before hydration completes silently does nothing — the change event
 * has no handler yet and React then resets the select to its own state.
 * Retrying until the hidden input agrees removes the race.
 */
export async function chooseOption(
  page: Page,
  selectId: string,
  hiddenName: string,
  value: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.selectOption(selectId, value);
    const applied = await page.inputValue(`input[name="${hiddenName}"]`).catch(() => "");
    if (applied === value) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`${selectId} never accepted ${value} — hydration may have failed.`);
}

/**
 * Spends every point the builder is holding.
 *
 * Round-robin rather than piling into the first stat, for two reasons. It
 * produces a character somebody might actually have built — 3/3/3/3/3/2/2
 * rather than 5/5/5/1/1/1/1 — and it lands exactly on budget whatever the
 * numbers are, because the buttons disable themselves at a stat's ceiling and
 * again when nothing is left. Changing `POINTS_TO_SPEND` or adding an eighth
 * stat cannot break this the way a hardcoded sequence of clicks would.
 */
export async function spendStatBudget(page: Page) {
  const raises = page.locator('button[aria-label^="Raise "]');
  await raises.first().waitFor({ state: "visible" });

  // One pass per point available, which is more than enough and cannot spin.
  for (let pass = 0; pass < 40; pass += 1) {
    const count = await raises.count();
    let clicked = false;

    for (let index = 0; index < count; index += 1) {
      const button = raises.nth(index);
      if (await button.isDisabled()) continue;
      await button.click();
      clicked = true;
    }

    if (!clicked) return;
  }

  throw new Error("the stat budget never ran out — the allocator may not be disabling its buttons");
}

/**
 * Picks the things she is good at, by their own names.
 *
 * Given nothing, it takes the calling's own suggestions — the green ones, which
 * is what a child picks — so a test never has to know the catalogue. Given
 * names, it takes those, which is how a test that needs a *particular* skill
 * later on says so.
 */
export async function pickSkills(page: Page, archetype: string, wanted?: string[]) {
  const suggested = findArchetype(archetype)?.skills ?? [];
  const names = (wanted ?? suggested).slice(0, SKILLS_PER_CHARACTER);

  for (const name of names) {
    await page.getByRole("button", { name, exact: true }).click();
  }

  const chosen = await page.locator('input[name="skills"]').count();
  if (chosen !== names.length) {
    throw new Error(`asked for ${names.length} skills and the form holds ${chosen}`);
  }
}

/** Everything the builder will accept beyond the three required answers. */
export type CharacterExtras = {
  pronouns?: string;
  gender?: string;
  ageBand?: string;
  description?: string;
  /** Particular skills, when a later assertion depends on one. */
  skills?: string[];
};

/**
 * Builds an adventurer the way a family does, and leaves the page where the
 * builder sent it.
 *
 * The positional shape is the one nine tests already called with, so adopting
 * this changed no call sites — only what happens inside.
 */
export async function buildCharacter(
  page: Page,
  name: string,
  race: string,
  archetype: string,
  extras: CharacterExtras = {},
) {
  await page.goto(`${BASE}/characters/new`);
  await page.fill('input[name="name"]', name);
  await chooseOption(page, "select#choice-race", "race", race);
  await chooseOption(page, "select#choice-archetype", "archetype", archetype);

  if (extras.pronouns !== undefined) await page.fill('input[name="pronouns"]', extras.pronouns);
  if (extras.gender !== undefined) await page.fill('input[name="gender"]', extras.gender);
  if (extras.ageBand !== undefined) await page.selectOption('select[name="ageBand"]', extras.ageBand);
  if (extras.description !== undefined) {
    await page.fill('textarea[name="description"]', extras.description);
  }

  await spendStatBudget(page);
  await pickSkills(page, archetype, extras.skills);

  await submitAndSettle(page, 'button:has-text("Create adventurer")');

  // Loudly, and here rather than forty lines later on a findFirstOrThrow. The
  // whole reason this file exists is that the old helper failed silently.
  if (page.url().includes("/characters/new")) {
    const shown = await page.locator("body").innerText();
    throw new Error(
      `the builder refused ${name} and stayed put. What it said:\n${shown.slice(0, 400)}`,
    );
  }
}
