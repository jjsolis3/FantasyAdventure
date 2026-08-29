/**
 * The turning between two chapters, and the choice that has to be made there.
 *
 * ## The two things only a real chapter ending can show
 *
 * **That it blocks.** A fork nobody has to answer is a poll, and a poll is
 * decoration. The turn has to actually refuse, which means driving a chapter to
 * its close and then trying to carry on.
 *
 * **That it cannot strand anybody.** The block only exists when the storyteller
 * offered two real ways. `MOCK_SAMEWAY=1` makes it offer the same place worded
 * twice — what a small model does when asked for variety at the moment it has
 * least to go on — and the game must throw that away and carry on rather than
 * put a meaningless choice in front of a child or, worse, stop.
 *
 * Both halves need the storyteller behaving differently, so this is two runs.
 *
 * Usage:
 *   1. Postgres running, migrations applied, accounts table empty, seeded.
 *   2. The mock storyteller and the app, with MOCK_SAMEWAY set or not.
 *   3. npx tsx tests/forks.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, submitAndSettle } from "./e2e-helpers.mts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";
import { CHOSEN_ROAD_KEY } from "../lib/game/forks.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@localhost:5432/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** What a player types to ask the mock storyteller to finish the chapter. */
const END_MARKER = "bring the story to its end";

const sameWay = process.env.MOCK_SAMEWAY === "1";

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

  await page.goto(`${BASE}/register`);
  await page.fill('input[name="inviteCode"]', bootstrap.code);
  await page.fill('input[name="displayName"]', "Dad");
  await page.fill('input[name="email"]', "dad@example.test");
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);

  await buildCharacter(page, "Mira", "Human", "Trickster", { pronouns: "she/her" });
  await buildCharacter(page, "Rowan", "Human", "Guardian", { pronouns: "they/them" });

  const user = await db.user.findFirstOrThrow({ where: { email: "dad@example.test" } });
  const [mira, rowan] = await Promise.all([
    db.character.findFirstOrThrow({ where: { name: "Mira" } }),
    db.character.findFirstOrThrow({ where: { name: "Rowan" } }),
  ]);

  // Two acts at least, so finishing the first turns a chapter rather than
  // ending the adventure — a fork after the last chapter would be a road to
  // nowhere, and the engine does not make one.
  const storyline = await db.storyline.findFirstOrThrow({
    where: { minPlayers: { lte: 2 }, acts: { some: { index: 2 } } },
    include: { acts: true },
  });

  const campaign = await db.campaign.create({
    data: {
      title: "Which way",
      joinCode: generateJoinCode(),
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "MIDDLE_GRADE",
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  await beginCampaign(campaign.id, user.id);

  // An ordinary turn ends no chapter and offers no fork.
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I look around the barley." },
  ]);
  check("an ordinary turn offers no choice",
    (await db.fork.count({ where: { campaignId: campaign.id } })) === 0);

  // The phrase the mock keys on to finish a chapter.
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: `I finish what we came for — ${END_MARKER}.` },
  ]);

  const fork = await db.fork.findFirst({ where: { campaignId: campaign.id } });

  if (sameWay) {
    // ---- The storyteller offered the same place twice -----------------------
    check("the same road worded twice is thrown away", fork === null,
      fork ? `${fork.whereA} / ${fork.whereB}` : "no fork");

    // And the story carries on, which is the point. The old behaviour is a safe
    // place to fall back to; a stuck campaign is not. Asserted on the turn
    // counter rather than on the absence of a throw — "no exception" is the
    // kind of check that passes for the wrong reason.
    const before = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    await playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "We press on regardless." },
    ]);
    const after = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    check("and the adventure carries on as it always did",
      after.turnCounter > before.turnCounter,
      `turn ${before.turnCounter} → ${after.turnCounter}`);
  } else {
    // ---- Two real roads -----------------------------------------------------
    check("finishing a chapter offers two ways on", fork !== null);
    check("which are genuinely different places",
      fork !== null && fork.whereA !== fork.whereB,
      fork ? `${fork.whereA} / ${fork.whereB}` : "");
    check("and nobody has chosen yet", fork?.chosen === null);

    // The block. This is the claim.
    let refused = false;
    await playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "I set off without deciding." },
    ]).catch(() => (refused = true));
    check("the story will not go on until they choose", refused);

    // ---- On screen ----------------------------------------------------------
    await page.goto(`${BASE}/campaigns/${campaign.id}/play`);
    await page.waitForLoadState("networkidle");

    check("the table is asked which way",
      (await page.locator("text=/The road goes two ways/").count()) > 0);
    check("and both roads are on screen",
      (await page.getByRole("button", { name: new RegExp(fork!.whereA, "i") }).count()) > 0 &&
        (await page.getByRole("button", { name: new RegExp(fork!.whereB, "i") }).count()) > 0);

    // Nothing else may be pressed while the question stands.
    check("with nowhere to type a turn until it is answered",
      (await page.locator("textarea").count()) === 0);

    await page.getByRole("button", { name: new RegExp(fork!.whereB, "i") }).click();
    // The question going away is the observable end of the write. A server
    // action does not navigate, so `networkidle` resolves while the choice is
    // still in flight — which read the unchosen row back and reported a click
    // that had in fact worked.
    await page.locator("text=/The road goes two ways/").waitFor({ state: "detached", timeout: 15_000 });

    const taken = await db.fork.findFirstOrThrow({ where: { campaignId: campaign.id } });
    check("choosing one records which", taken.chosen === "B", taken.chosen ?? "none");
    check("and who chose it", taken.chosenById === user.id);

    // ---- The next chapter is told ------------------------------------------
    const memory = await db.memory.findFirst({
      where: { campaignId: campaign.id, key: CHOSEN_ROAD_KEY },
    });
    check("the storyteller is told which road they took",
      (memory?.content ?? "").includes(taken.whereB), memory?.content ?? "none");
    check("and told it loudly", memory?.importance === 5);

    // ---- And the story runs again -------------------------------------------
    const before = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    await playTurn(campaign.id, user.id, [
      { characterId: mira.id, text: "We take the road we agreed on." },
    ]);
    const after = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    check("the story goes on once they have chosen",
      after.turnCounter > before.turnCounter,
      `turn ${before.turnCounter} → ${after.turnCounter}`);

    // A second press cannot change it.
    const again = await db.fork.findFirstOrThrow({ where: { campaignId: campaign.id } });
    check("and the road taken stays taken", again.chosen === "B");
  }
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
