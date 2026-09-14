/**
 * Two families, a code between them, and what happens when it is taken back.
 *
 * This is the test the whole boundary was built for, and it replays the thing
 * that was actually asked: *"I have a good friend who would like to try it with
 * his kids."* Before this, the moment his family registered, the party picker on
 * every screen would have offered his children's adventurers to mine and mine to
 * his, each labelled with the parent's name. Not a hypothetical — the rule was
 * `{ userId: { not: userId } }`, every character in the database.
 *
 * So the assertions are the four states two families can be in:
 *
 *   1. **Strangers.** Neither can see the other's adventurers anywhere — not in
 *      the picker, not by guessing a URL, and not through the two image routes
 *      that carried hand-written copies of the access rule and would otherwise
 *      have kept answering the old question after the rule moved.
 *   2. **Agreed.** One family shares its code, the other types it, and the
 *      adventurers appear. Sharing is one consent, redeeming is the other.
 *   3. **Travelling.** A joint adventure, with children from both houses in it.
 *   4. **Stopped.** The link is cut. An adventurer the two families never
 *      travelled with disappears from the picker, and a new adventure is closed
 *      to them again — **but the one already under way still opens for both,
 *      both still see the party, and the children in it stay visible to each
 *      other.** That last part is the rule working rather than leaking: a
 *      half-played Saturday does not disappear, and somebody your child has
 *      adventured with does not become a stranger, because two adults stopped
 *      agreeing.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399.
 *   3. DATABASE_URL=… npx tsx tests/families.e2e.mts
 *
 * Needs no model server — nothing here plays a turn.
 *
 * ## A note on the names
 *
 * Every adventurer and adult here is named something that appears **nowhere**
 * in the seeded storylines, and that is load-bearing rather than whimsy. These
 * assertions read the rendered page and ask whether a name is in it, so a name
 * that is also ordinary prose gives a wrong answer: "Bram" was one of these for
 * an afternoon, and the check failed against the word *brambles* in an
 * adventure description while the code under test was perfectly correct. "Sam"
 * was worse — it appears eight times in the seed and the check passed by luck.
 * If you add a character here, grep `prisma/storylines.ts` for the name first.
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { BASE, buildCharacter, householdOf, submitAndSettle } from "./e2e-helpers.mjs";
import { generateInviteCode, generateJoinCode } from "../lib/auth/invite-code.ts";

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
  await page.fill('input[name="handle"]', email);
  await page.fill('input[name="password"]', "a long enough password");
  await submitAndSettle(page);
  await page.waitForURL(`${BASE}/`);
}

/** What the party picker on the setup screen is offering. */
async function offered(page: Page): Promise<string> {
  await page.goto(`${BASE}/campaigns/new`);
  await page.waitForLoadState("networkidle");
  return (await page.textContent("main")) ?? "";
}

/** Whether an image route will hand this adventurer's picture over. */
async function imageStatus(context: BrowserContext, characterId: string, kind: string) {
  const response = await context.request.get(`${BASE}/api/characters/${characterId}/${kind}`, {
    failOnStatusCode: false,
  });
  return response.status();
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
  const bootstrap = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });
  if (!bootstrap) throw new Error("No unredeemed bootstrap invite — reset accounts and re-seed.");

  console.log("\n-- Two families, admitted one at a time --------------------------");

  const solisContext = await browser.newContext();
  const solis = await solisContext.newPage();
  await register(solis, bootstrap.code, "Jose", "jose@example.com");
  const joseId = (
    await db.user.findUniqueOrThrow({ where: { email: "jose@example.com" }, select: { id: true } })
  ).id;
  const solisHome = await householdOf(db, joseId);

  // The friend's family, admitted by the only person who may admit one.
  const friendInvite = await db.inviteCode.create({
    data: {
      code: generateInviteCode(),
      grant: "NEW_HOUSEHOLD",
      forName: "My friend",
      createdById: joseId,
    },
  });

  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await register(friend, friendInvite.code, "Wrenna", "wrenna@example.com");
  const friendUser = await db.user.findUniqueOrThrow({
    where: { email: "wrenna@example.com" },
    select: { id: true },
  });
  const friendHome = await householdOf(db, friendUser.id);

  check("two households, not one", solisHome !== friendHome, `${solisHome} vs ${friendHome}`);

  // A child in each house, so there is something to not see.
  //
  // And a second one in the friend's house who will never join the shared
  // adventure. He is the whole point of the last section: once the two
  // families have travelled together, Quenby stays visible forever — that is the
  // rule working — so *she* is the one who proves the picker actually narrowed
  // when the link was cut, rather than the check quietly passing on somebody
  // the party branch was always going to match.
  await buildCharacter(solis, "Tamsyn", "Human", "Trickster");
  await buildCharacter(solis, "Merrow", "Human", "Wondersmith");
  await buildCharacter(friend, "Quenby", "Fox-folk", "Healer");
  await buildCharacter(friend, "Halbrick", "Stonekin", "Guardian");

  const tamsyn = await db.character.findFirstOrThrow({ where: { name: "Tamsyn" } });
  const quenby = await db.character.findFirstOrThrow({ where: { name: "Quenby" } });
  check(
    "each adventurer is stamped with the family that built her",
    tamsyn.householdId === solisHome && quenby.householdId === friendHome,
  );

  // Quenby gets an actual face, and this is not decoration for the test.
  //
  // Both image routes answer 404 for an adventurer with no picture *and* for
  // one the caller may not see, so asserting 404 against a pictureless
  // character proves nothing at all — it would pass with the rule removed
  // entirely. Giving her a picture is what makes the refusal below mean
  // "refused" rather than "there was nothing there anyway", and what lets the
  // same call return 200 once the families have agreed.
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");
  await db.characterPortrait.create({
    data: { characterId: quenby.id, data: bytes, mimeType: "image/png" },
  });
  await db.characterArt.create({
    data: {
      characterId: quenby.id,
      data: bytes,
      lookKey: "test",
      prompt: "a fox-folk healer",
      model: "test",
    },
  });

  console.log("\n-- Strangers: neither family can see the other -------------------");

  const solisSees = await offered(solis);
  check("the picker does not offer the other family's child", !solisSees.includes("Quenby"), "Quenby listed");
  check("nor name the adult who plays them", !solisSees.includes("Wrenna"), "Wrenna listed");

  const friendSees = await offered(friend);
  check("and it is symmetric", !friendSees.includes("Tamsyn"), "Tamsyn listed");

  // Guessing the id gets nowhere either. Not found rather than forbidden: a 403
  // would confirm that the id belongs to somebody.
  await solis.goto(`${BASE}/characters/${quenby.id}/story`);
  check(
    "her story does not open from outside the family",
    !(await solis.textContent("body"))?.includes("Quenby"),
    solis.url(),
  );

  // The two routes that carried hand-written copies of the rule. In a
  // single-family app a duplicated rule is a smell; between two families it is a
  // leak, because changing the rule leaves the copy answering the old question.
  //
  // She has a picture, so a 404 here is a refusal rather than an absence — and
  // the same two calls come back 200 once the families agree, which is what
  // proves these checks are testing the rule and not the emptiness.
  const strangerPortrait = await imageStatus(solisContext, quenby.id, "portrait");
  const strangerArt = await imageStatus(solisContext, quenby.id, "art");
  check("the portrait route refuses a stranger's adventurer", strangerPortrait === 404, String(strangerPortrait));
  check("and so does the drawn one", strangerArt === 404, String(strangerArt));

  // The control: her own family gets the same two calls answered.
  check(
    "while her own family can see her face",
    (await imageStatus(friendContext, quenby.id, "portrait")) === 200,
    String(await imageStatus(friendContext, quenby.id, "portrait")),
  );

  // A join code still works between families who have agreed to nothing — and
  // that is deliberate, after this test briefly asserted the opposite.
  //
  // Gating it on a household link sounded safer and was not: linking is a
  // *household* act, so an aunt handed a code across the room would have had to
  // expose every child in both families, permanently, to join one evening. A
  // rule that pushes people into over-linking costs more privacy than it saves.
  //
  // So the two codes keep two different scopes. What is asserted here is that
  // the narrow one really is narrow: joining by code hands over that adventure
  // and the people in it, and **not** the household's other children.
  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const solisOnly = await db.campaign.create({
    data: {
      title: "The Barley Field",
      ownerId: joseId,
      householdId: solisHome,
      storylineId: storyline.id,
      tone: "COZY",
      readingLevel: "FAMILY_MIXED",
      joinCode: generateJoinCode(),
      party: { create: [{ characterId: tamsyn.id, position: 0 }] },
    },
  });

  await friend.goto(`${BASE}/campaigns/join`);
  await friend.fill('input[name="code"]', solisOnly.joinCode);
  await friend.click('button:has-text("Quenby")');
  await submitAndSettle(friend, 'button:has-text("Join the adventure")');
  check(
    "a code handed over still gets a guest to that table",
    friend.url().includes(`/campaigns/${solisOnly.id}`),
    friend.url(),
  );
  check(
    "and they see who is in the party",
    ((await friend.textContent("main")) ?? "").includes("Tamsyn"),
  );

  // But the Solis house has another child who is in no adventure at all, and
  // joining one party is not a way to meet her.
  check(
    "but not the household's other children",
    !((await offered(friend)).includes("Merrow")),
  );

  // Take her back out, so the sections below start from two families who have
  // agreed to nothing and travelled nowhere.
  await db.partyMember.deleteMany({ where: { campaignId: solisOnly.id, characterId: quenby.id } });

  console.log("\n-- Agreed: one shares a code, the other types it -----------------");

  await friend.goto(`${BASE}/settings/families`);
  await friend.waitForLoadState("networkidle");
  const friendCode = await friend.textContent("code");
  check("a family has a code to give out", /KIN-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(friendCode ?? ""), friendCode ?? "");

  await solis.goto(`${BASE}/settings/families`);
  await solis.waitForLoadState("networkidle");
  await solis.fill('input[name="code"]', friendCode ?? "");
  await solis.click('button:has-text("Adventure together")');
  await solis.waitForSelector("text=/can adventure together now/", { timeout: 10_000 });

  const links = await db.householdLink.count();
  check("one row, not two", links === 1, `${links} links`);

  const link = await db.householdLink.findFirstOrThrow();
  check(
    "stored with the smaller id first, so the pair is one row either way round",
    link.householdAId < link.householdBId,
    `${link.householdAId} / ${link.householdBId}`,
  );

  const nowOffered = await offered(solis);
  check("now the picker offers them", nowOffered.includes("Quenby"));
  check("all of them, not only the one they end up playing with", nowOffered.includes("Halbrick"));
  const friendNowSees = await offered(friend);
  check("and offers them the other way too", friendNowSees.includes("Tamsyn"));
  // Including the Solis child who is in no adventure — she is the one the check
  // after the unlink turns on, so it matters that she is visible *here*.
  check("the whole household, not only the one in a party", friendNowSees.includes("Merrow"));

  // The same two calls that were refused a moment ago, from the same browser.
  const linkedPortrait = await imageStatus(solisContext, quenby.id, "portrait");
  const linkedArt = await imageStatus(solisContext, quenby.id, "art");
  check("her portrait is now served to the family she plays with", linkedPortrait === 200, String(linkedPortrait));
  check("and so is the drawn one", linkedArt === 200, String(linkedArt));

  console.log("\n-- Travelling: a joint adventure ---------------------------------");

  const joint = await db.campaign.create({
    data: {
      title: "The Long Meadow",
      ownerId: joseId,
      householdId: solisHome,
      storylineId: storyline.id,
      tone: "ADVENTUROUS",
      readingLevel: "FAMILY_MIXED",
      joinCode: generateJoinCode(),
      party: {
        create: [
          { characterId: tamsyn.id, position: 0 },
          { characterId: quenby.id, position: 1 },
        ],
      },
    },
  });

  await friend.goto(`${BASE}/campaigns/${joint.id}`);
  check(
    "the other family can open the adventure their child is in",
    friend.url().includes(`/campaigns/${joint.id}`),
    friend.url(),
  );
  check("and sees who is travelling", (await friend.textContent("main"))?.includes("Tamsyn") === true);

  console.log("\n-- Stopped: the link is cut --------------------------------------");

  await solis.goto(`${BASE}/settings/families`);
  await solis.waitForLoadState("networkidle");
  await solis.click('button:has-text("Stop")');

  // Wait for the screen to say the list is empty, rather than for the network
  // to go quiet. `networkidle` can resolve before a server action's POST has
  // even started, which is how this read the database a beat too early and
  // reported three failures for one race.
  await solis.waitForSelector("text=/Nobody yet/", { timeout: 10_000 });

  check("the link is gone", (await db.householdLink.count()) === 0);

  // Halbrick is the one to look at. He never joined the shared adventure, so the
  // party branch has nothing to say about him and only the household branch
  // could ever have offered him — which means his disappearance is the link
  // being read, and nothing else.
  const afterStopping = await offered(solis);
  check("the adventurer they never travelled with is gone from the picker", !afterStopping.includes("Halbrick"));

  // Quenby, by contrast, is *still* there — and that is the rule working rather
  // than leaking. Somebody your children have adventured with does not become a
  // stranger because two adults stopped agreeing.
  check("but the one they did travel with remains", afterStopping.includes("Quenby"));

  // Nothing is asserted about what the *friend's* picker now shows. The only
  // Solis adventurer is Tamsyn, and Tamsyn is in the shared party, so she stays
  // visible to them whatever the link says — a check there could only be
  // written to pass. The friend's half of the cut is proved below instead, by
  // a door that really is shut.

  // And the Solis child who never travelled with them is out of reach again,
  // which is the friend's half of the cut.
  check(
    "and the other family loses sight of them too",
    !((await offered(friend)).includes("Merrow")),
  );

  // The half of this that matters most, and the reason the party branch of
  // `visibleCharacterWhere` never mentions households.
  await friend.goto(`${BASE}/campaigns/${joint.id}`);
  check(
    "but the adventure already under way still opens",
    friend.url().includes(`/campaigns/${joint.id}`),
    friend.url(),
  );
  const stillThere = (await friend.textContent("main")) ?? "";
  check("and both children are still at the table", stillThere.includes("Tamsyn") && stillThere.includes("Quenby"));

  await solis.goto(`${BASE}/campaigns/${joint.id}`);
  check(
    "from both sides",
    ((await solis.textContent("main")) ?? "").includes("Quenby"),
  );

  console.log("\n-- And a child cannot attach the family to strangers -------------");

  // A `MEMBER` account: somebody who plays, invited into the Solis house.
  const childCode = await db.inviteCode.create({
    data: {
      code: generateInviteCode(),
      grant: "HOUSEHOLD_MEMBER",
      householdId: solisHome,
      intendedRole: "MEMBER",
      forName: "Ada",
    },
  });
  const childContext = await browser.newContext();
  const child = await childContext.newPage();
  await register(child, childCode.code, "Ada", "ada@example.com");

  await child.goto(`${BASE}/settings/families`);
  check(
    "the screen is not hers to reach",
    !child.url().endsWith("/settings/families"),
    child.url(),
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
} finally {
  await browser.close();
  await db.$disconnect();
}

process.exit(failures === 0 ? 0 : 1);
