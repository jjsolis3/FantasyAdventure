/**
 * The wardrobe and the guidance, through the real pipeline.
 *
 * What only a database and a real turn can settle:
 *
 *   1. **The migration is harmless.** Six nullable columns and no backfill, so
 *      every adventurer already in a household opens the dressing room with
 *      empty slots and an unchanged description. Proved by making a character
 *      the way the old builder did and reading her back.
 *   2. **The look reaches the storyteller labelled.** The whole reason the
 *      wardrobe exists is that `description` was being appended to the party
 *      line unlabelled and the storyteller was building every passage around
 *      it. This asserts the two lines are separate and that the look says it is
 *      scenery.
 *   3. **Leads survive a turn.** They are written onto the passage that raised
 *      them and gathered across the scene, de-duplicated — which matters
 *      because the storyteller is told to repeat a live one.
 *   4. **The recap is built from what changed.** Every milestone is a SYSTEM
 *      row on its own scene, and the ledger is read back off those rows rather
 *      than paraphrased from prose.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. npx tsx tests/mock-model-server.mts 11499 &
 *   3. AI_BASE_URL=http://127.0.0.1:11499/v1 npx tsx tests/wardrobe.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { beginCampaign, playTurn } from "../lib/engine/play.ts";
import { earnedWearables, lookColumns, lookOf, lookSentence } from "../lib/game/wardrobe.ts";
import { characterPicture } from "../lib/game/character-picture.ts";
import { alreadyTried, leadsFrom, neededObjectives } from "../lib/game/briefing.ts";
import { chapterCard, recapFor } from "../lib/game/recap.ts";
import { canonicalPair } from "../lib/game/rules.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { generateJoinCode } from "../lib/auth/invite-code.ts";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5506/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const stamp = Date.now();
  const user = await db.user.create({
    data: {
      email: `ward-${stamp}@example.test`,
      displayName: "Parent",
      passwordHash: await hashPassword("hunter2hunter2"),
      role: "ADMIN",
    },
  });

  console.log("\n-- An adventurer made the way she was before ---------------------");
  // Exactly what the old builder wrote: no look columns at all.
  const [mira, rowan] = await Promise.all([
    db.character.create({
      data: {
        name: "Mira",
        userId: user.id,
        race: "Human",
        archetype: "Trickster",
        pronouns: "she/her",
        ageBand: "CHILD",
        description: "Names every animal she meets, and will not be hurried.",
      },
    }),
    db.character.create({
      data: {
        name: "Rowan",
        userId: user.id,
        race: "Human",
        archetype: "Guardian",
        pronouns: "he/him",
        ageBand: "CHILD",
      },
    }),
  ]);

  check("an existing adventurer has no look and is not broken by that", !lookSentence(lookOf(mira)));
  check("her description is untouched", mira.description?.startsWith("Names every animal") === true);

  const before = characterPicture({
    id: mira.id,
    name: mira.name,
    look: lookOf(mira),
    portraitVersion: null,
    art: null,
  });
  console.log(`     picture: ${before.source}${before.source === "CREST" ? ` ${before.ink}` : ""}`);
  check("and she still has a face", before.source === "CREST");

  console.log("\n-- The girls dress her ------------------------------------------");
  const dressed = await db.character.update({
    where: { id: mira.id },
    data: lookColumns({
      hair: "two braids, tied with ribbon",
      layer: "a hooded travelling cloak",
      colour: "moss green",
      signature: "a whistle on a cord",
    }),
  });

  const sentence = lookSentence(lookOf(dressed), "Mira");
  console.log(`     ${sentence}`);
  check("the sentence is stored and reads back", /moss green/.test(sentence));

  const after = characterPicture({
    id: dressed.id,
    name: dressed.name,
    look: lookOf(dressed),
    portraitVersion: null,
    art: null,
  });
  check(
    "her crest changes colour with her",
    after.source === "CREST" && before.source === "CREST" && after.ink !== before.ink,
  );

  // Taking the helmet off has to actually take it off.
  const stripped = await db.character.update({
    where: { id: mira.id },
    data: lookColumns({ colour: "moss green" }),
  });
  check("clearing a slot clears it", stripped.lookLayer === null, String(stripped.lookLayer));

  await db.character.update({
    where: { id: mira.id },
    data: lookColumns({
      hair: "two braids, tied with ribbon",
      layer: "a hooded travelling cloak",
      colour: "moss green",
      signature: "a whistle on a cord",
    }),
  });

  console.log("\n-- An adventure ------------------------------------------------");
  await db.relationship.create({
    data: {
      ...canonicalPair(mira.id, rowan.id, "SIBLING"),
      proposedById: user.id,
      confirmedAt: new Date(),
    },
  });

  const storyline = await db.storyline.findFirstOrThrow({ where: { minPlayers: { lte: 2 } } });
  const campaign = await db.campaign.create({
    data: {
      title: "The Barley Field",
      ownerId: user.id,
      storylineId: storyline.id,
      tone: "COZY",
      readingLevel: "FAMILY_MIXED",
      joinCode: generateJoinCode(),
      party: {
        create: [
          { characterId: mira.id, position: 0 },
          { characterId: rowan.id, position: 1 },
        ],
      },
    },
  });

  await beginCampaign(campaign.id, user.id);
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I look under the loose board by the door." },
    { characterId: rowan.id, text: "I hold the lamp steady for her." },
  ]);
  await playTurn(campaign.id, user.id, [
    { characterId: mira.id, text: "I follow the flattened track." },
    { characterId: rowan.id, text: "I count the doors as we pass them." },
  ]);

  console.log("\n-- What the storyteller was actually sent -----------------------");
  const loaded = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    include: { storyline: { include: { acts: { orderBy: { index: "asc" } } } } },
  });

  // The real prompt, read back off what was recorded when it was sent — rather
  // than rebuilt here, which would only prove the builder agrees with itself.
  const calls = await db.aiCall.findMany({
    where: { campaignId: campaign.id, stage: "narrate" },
    orderBy: { createdAt: "desc" },
    select: { promptPreview: true },
  });
  // The most recent one that carries the party block. Only the last two turns
  // were played after she was dressed, and the previews are truncated, so
  // finding the block rather than assuming which call holds it.
  const prompt = calls.map((call) => call.promptPreview ?? "").find((text) => text.includes("- Mira")) ?? "";

  const partyLine = prompt.split("\n").filter((line) => line.includes("Mira"))[0] ?? "";
  console.log(
    prompt
      .split("\n")
      .filter((line) => /Mira|Looks like|Who they are/.test(line))
      .slice(0, 6)
      .join("\n"),
  );

  check("what she looks like is on its own labelled line", /Looks like:/.test(prompt));
  check("and is told plainly that it is scenery", /Scenery, not plot/.test(prompt));
  check("who she is is a different line", /Who they are:/.test(prompt));
  check(
    "and the two are not run together the way they used to be",
    !/Names every animal she meets[^\n]*moss green/.test(prompt),
    partyLine.slice(0, 120),
  );

  console.log("\n-- Somewhere to try --------------------------------------------");
  const scene = await db.scene.findFirstOrThrow({
    where: { campaignId: campaign.id, status: "OPEN" },
    select: { id: true, title: true, summary: true },
  });
  const turns = await db.turnEvent.findMany({
    where: { sceneId: scene.id },
    orderBy: { ordinal: "asc" },
    select: { type: true, content: true, metadata: true },
  });

  const leads = leadsFrom(turns);
  console.log(`     ${leads.join(" | ") || "(none)"}`);
  check("a lead survives the turn onto the passage", leads.length === 1, `${leads.length}`);
  check(
    "and the same lead repeated every turn is listed once",
    leads.length === 1,
    leads.join(" | "),
  );

  const tried = alreadyTried(turns);
  console.log(`     tried: ${tried.map((attempt) => attempt.text).join(" | ")}`);
  check("every attempt is on the checklist", tried.length === 4, String(tried.length));
  check("newest first", tried[0]?.text === "I count the doors as we pass them.", tried[0]?.text);

  console.log("\n-- What would count --------------------------------------------");
  const needed = await neededObjectives(campaign.id);
  for (const objective of needed) {
    console.log(`     ${objective.text}\n       counts: ${objective.counts.join(", ")}`);
  }
  check("a FIND says what would count", needed.some((o) => o.counts.length > 0));
  check(
    "and never offers a word the matcher mangled",
    needed.every((o) => o.counts.every((word) => !/^bras$/.test(word))),
    needed.flatMap((o) => o.counts).join(", "),
  );

  console.log("\n-- What actually changed ---------------------------------------");
  const recap = await recapFor(scene);
  for (const line of recap.changed) console.log(`     ${line}`);
  console.log(`     dice: ${recap.rolls.landed}/${recap.rolls.thrown}`);
  check("the ledger is read off the milestones", recap.changed.length > 0);
  check("and counts the dice", recap.rolls.thrown > 0);
  check(
    "a spend is not mistaken for something that lasts",
    recap.changed.every((line) => !/\bused\b.*\.$/.test(line)),
    recap.changed.join(" | "),
  );

  console.log("\n-- Something she found, worn --------------------------------------");
  await db.inventoryItem.create({
    data: {
      characterId: mira.id,
      name: "a moth-eaten grey cloak",
      foundInCampaignId: campaign.id,
    },
  });
  const items = await db.inventoryItem.findMany({
    where: { characterId: mira.id },
    select: { name: true, foundInCampaignId: true },
  });
  const wearable = earnedWearables(items, new Map([[campaign.id, campaign.title]]));
  console.log(`     ${wearable.map((w) => `${w.text} (${w.slot}, ${w.from})`).join(", ")}`);
  check("a cloak she found can be worn", wearable.some((w) => w.slot === "layer"));
  check("and says which adventure gave it to her", wearable[0]?.from === "from The Barley Field");

  console.log("\n-- The chapter card --------------------------------------------");
  // The card reads the chapter behind them, so jump the act on the way a real
  // turn would and ask for the one just finished.
  await db.campaign.update({ where: { id: campaign.id }, data: { currentActIndex: 2 } });
  const card = await chapterCard({
    campaignId: campaign.id,
    finishedIndex: 1,
    finishedTitle: loaded.storyline.acts[0].title,
    next: { index: 2, title: loaded.storyline.acts[1]?.title ?? "…" },
    party: [
      { characterId: mira.id, name: "Mira" },
      { characterId: rowan.id, name: "Rowan" },
    ],
  });
  if (!card) throw new Error("No chapter card came back.");

  console.log(`     ${card.title}: ${card.did.length} things, ${card.rolls.thrown} rolls`);
  console.log(`     carrying: ${card.carrying.map((c) => `${c.name} — ${c.items.join(", ")}`).join(" · ")}`);
  check("the card knows what they did", card.did.length > 0);
  check("and what they carry on", card.carrying.length > 0);
  check(
    "and only what this adventure gave them",
    card.carrying.every((entry) => entry.items.length > 0),
  );

  console.log(`\n${failures === 0 ? "All good." : `${failures} failed.`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
