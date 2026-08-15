import assert from "node:assert/strict";
import test from "node:test";
import { entryFor, rollTally, stateOf } from "../lib/game/chronicle.ts";
import { tally, totalXp, xpFromQuests, xpFromRolls } from "../lib/game/summary.ts";
import { QUEST_XP } from "../lib/game/rules.ts";

const roll = (outcome: string, total: number, target: number) =>
  ({ outcome, total, target }) as Parameters<typeof rollTally>[0][number];

// ---- The dice, over a lifetime ---------------------------------------------

test("landed counts the two outcomes that actually worked", () => {
  const counted = rollTally([
    roll("CRITICAL", 24, 12),
    roll("SUCCESS", 14, 12),
    roll("COMPLICATION", 11, 12),
    roll("FAILURE", 4, 12),
  ]);

  assert.equal(counted.thrown, 4);
  assert.equal(counted.landed, 2);
});

test("the best roll is a margin, not a raw number", () => {
  // The whole reason this is a margin: the second throw is the bigger number
  // and the first is the better story. A 20 against a target of 8 is luck.
  const counted = rollTally([roll("SUCCESS", 21, 9), roll("CRITICAL", 22, 8)]);
  assert.equal(counted.best, 14);
});

test("a miss never becomes a best roll", () => {
  assert.equal(rollTally([roll("FAILURE", 4, 12)]).best, null);
});

test("an adventurer who has never thrown reports nothing rather than zero", () => {
  assert.deepEqual(rollTally([]), { thrown: 0, landed: 0, best: null });
});

// ---- How an adventure reads ------------------------------------------------

test("a paused adventure is set aside, never abandoned", () => {
  // The wording matters more than it looks. The story moved on, which is not
  // the same as having lost — the same reason `tally` calls them chaptersLeft.
  assert.equal(stateOf("PAUSED"), "SET_ASIDE");
  assert.equal(stateOf("COMPLETE"), "FINISHED");
  assert.equal(stateOf("ACTIVE"), "GOING");
  assert.equal(stateOf("SETUP"), "GOING");
});

// ---- What gets written down ------------------------------------------------

const quests = [
  { kind: "MAIN", status: "COMPLETE", secretForCharacterId: null },
  { kind: "MAIN", status: "ABANDONED", secretForCharacterId: null },
  { kind: "SIDE", status: "COMPLETE", secretForCharacterId: null },
  { kind: "PERSONAL", status: "COMPLETE", secretForCharacterId: "mira" },
] as Parameters<typeof tally>[0];

test("a snapshot is exactly what the ending would have said", () => {
  // The point of the whole design: `entryFor` calls the ending's arithmetic
  // rather than reimplementing it, so a trophy room and a summary can never
  // disagree about what an evening was worth. Proved by computing both.
  const rolls = [roll("SUCCESS", 15, 12), roll("FAILURE", 6, 12)];
  const written = entryFor({
    characterId: "mira",
    partyCharacterIds: ["mira", "rowan"],
    quests,
    rolls,
  });

  const counts = tally(quests);
  const expected = totalXp(
    "mira",
    xpFromRolls(rolls.map((r) => ({ characterId: "mira", outcome: r.outcome }))),
    xpFromQuests(quests, ["mira", "rowan"]),
  );

  assert.equal(written.xpEarned, expected);
  assert.equal(written.chapters, counts.chapters);
  assert.equal(written.errands, counts.errands);
  assert.equal(written.ownAims, counts.ownAims);
});

test("somebody else's private aim pays them and not her", () => {
  const hers = entryFor({
    characterId: "mira",
    partyCharacterIds: ["mira", "rowan"],
    quests,
    rolls: [],
  });
  const his = entryFor({
    characterId: "rowan",
    partyCharacterIds: ["mira", "rowan"],
    quests,
    rolls: [],
  });

  // Both travelled, so both were paid for the chapter and the errand. Only
  // Mira's own aim was hers.
  assert.equal(hers.xpEarned - his.xpEarned, QUEST_XP.PERSONAL);
  assert.equal(hers.ownAims, 1);
});

test("an adventure where nothing was finished still writes a row", () => {
  // A road that only remembers the good evenings is a road that lies about how
  // many there were.
  const written = entryFor({
    characterId: "mira",
    partyCharacterIds: ["mira"],
    quests: [],
    rolls: [],
  });

  assert.equal(written.chapters, 0);
  assert.equal(written.xpEarned, 0);
  assert.equal(written.rollsThrown, 0);
  assert.equal(written.bestRoll, null);
});
