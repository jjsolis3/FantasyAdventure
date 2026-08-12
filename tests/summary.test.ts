import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  tally,
  totalXp,
  verdict,
  xpFromQuests,
  xpFromRolls,
  type QuestRecord,
} from "../lib/game/summary.ts";
import { QUEST_XP } from "../lib/game/rules.ts";
import { abilitiesFor, abilityHints, abilityUnlockedAt, RANK_ABILITIES } from "../lib/game/practice.ts";

// ---- What the evening earned ------------------------------------------------

test("summary: experience is read back out of the rolls themselves", () => {
  // A character's xp is cumulative across every story she has been in, so what
  // she earned *here* has to be reconstructed rather than looked up.
  const earned = xpFromRolls([
    { characterId: "mira", outcome: "CRITICAL" },
    { characterId: "mira", outcome: "SUCCESS" },
    { characterId: "rowan", outcome: "COMPLICATION" },
  ]);

  assert.equal(earned.get("mira"), 5);
  assert.equal(earned.get("rowan"), 1, "a bad roll still teaches you something");
});

test("summary: nobody who never rolled is invented", () => {
  assert.equal(xpFromRolls([]).size, 0);
  assert.equal(xpFromRolls([]).get("mira"), undefined);
});

const party = ["mira", "rowan"];

test("summary: a chapter pays everybody who travelled", () => {
  const quests: QuestRecord[] = [
    { kind: "MAIN", status: "COMPLETE", secretForCharacterId: null },
  ];
  const earned = xpFromQuests(quests, party);

  assert.equal(earned.get("mira"), QUEST_XP.MAIN);
  assert.equal(earned.get("rowan"), QUEST_XP.MAIN);
});

test("summary: a private aim pays only the girl whose it was", () => {
  const quests: QuestRecord[] = [
    { kind: "PERSONAL", status: "COMPLETE", secretForCharacterId: "mira" },
  ];
  const earned = xpFromQuests(quests, party);

  assert.equal(earned.get("mira"), QUEST_XP.PERSONAL);
  assert.equal(earned.get("rowan"), undefined);
});

test("summary: nothing unfinished pays anything", () => {
  const quests: QuestRecord[] = [
    { kind: "MAIN", status: "ACTIVE", secretForCharacterId: null },
    { kind: "SIDE", status: "ABANDONED", secretForCharacterId: null },
  ];

  assert.equal(xpFromQuests(quests, party).size, 0);
});

test("summary: the two tallies read as one number", () => {
  const rolls = xpFromRolls([{ characterId: "mira", outcome: "SUCCESS" }]);
  const quests = xpFromQuests(
    [{ kind: "MAIN", status: "COMPLETE", secretForCharacterId: null }],
    party,
  );

  assert.equal(totalXp("mira", rolls, quests), 2 + QUEST_XP.MAIN);
  assert.equal(totalXp("nobody", rolls, quests), 0);
});

// ---- How it went ------------------------------------------------------------

test("summary: what was finished is counted, not scored", () => {
  // A percentage would invite comparing this evening to the last one, and an
  // adventure spent talking to the troll is not a worse adventure.
  const counts = tally([
    { kind: "MAIN", status: "COMPLETE", secretForCharacterId: null },
    { kind: "MAIN", status: "ABANDONED", secretForCharacterId: null },
    { kind: "SIDE", status: "COMPLETE", secretForCharacterId: null },
    { kind: "PERSONAL", status: "COMPLETE", secretForCharacterId: "mira" },
    { kind: "PERSONAL", status: "ACTIVE", secretForCharacterId: "rowan" },
  ]);

  assert.deepEqual(counts, { chapters: 1, chaptersLeft: 1, errands: 1, ownAims: 1 });
});

test("summary: a chapter the story moved past is left behind, not failed", () => {
  const counts = tally([{ kind: "MAIN", status: "ABANDONED", secretForCharacterId: null }]);
  assert.match(verdict(counts, true), /not by the road anybody expected/);
});

test("summary: finishing everything is said plainly and without gushing", () => {
  const counts = tally([{ kind: "MAIN", status: "COMPLETE", secretForCharacterId: null }]);
  assert.match(verdict(counts, true), /That is not nothing/);
});

test("summary: an unfinished adventure does not pretend to be over", () => {
  assert.equal(verdict(tally([]), false), "Still going.");
});

// ---- What a rank lets you do ------------------------------------------------

test("abilities: the first rank is still just a number", () => {
  assert.deepEqual(abilitiesFor({ name: "Climbing", rank: 1 }), []);
});

test("abilities: each rank past the first adds one, and keeps the earlier ones", () => {
  assert.equal(abilitiesFor({ name: "Climbing", rank: 2 }).length, 1);
  assert.equal(abilitiesFor({ name: "Climbing", rank: 3 }).length, 2);
  assert.equal(abilitiesFor({ name: "Climbing", rank: 4 }).length, RANK_ABILITIES.length);
});

test("abilities: they are about the skill, so a learned one works too", () => {
  // The catalogue could not name an ability for "Humming" because nobody knew
  // Humming would exist. The ability is the shape; the skill is the subject.
  const [first] = abilitiesFor({ name: "Humming", rank: 2 });

  assert.match(first.blurb, /Humming/);
  assert.match(first.hint, /Humming/);
});

test("abilities: reaching a rank names what it just unlocked", () => {
  assert.equal(abilityUnlockedAt({ name: "Climbing", rank: 2 })?.name, "Steady Hand");
  assert.equal(abilityUnlockedAt({ name: "Climbing", rank: 1 }), undefined);
});

test("abilities: the storyteller is told about every one she holds", () => {
  const hints = abilityHints([
    { name: "Climbing", rank: 3 },
    { name: "Humming", rank: 1 },
  ]);

  assert.equal(hints.length, 2, "two from Climbing, none from a rank-1 skill");
  assert.ok(hints.every((hint) => hint.includes("Climbing")));
});

test("abilities: every one of them actually tells the storyteller something", () => {
  for (const ability of abilitiesFor({ name: "Climbing", rank: 4 })) {
    assert.ok(ability.hint.length > 60, ability.name);
    assert.ok(ability.blurb.length > 20, ability.name);
  }
});

// ---- What the storyteller is told -------------------------------------------

import { buildContext, type PartyMemberContext } from "../lib/ai/context.ts";

function member(overrides: Partial<PartyMemberContext> = {}): PartyMemberContext {
  return {
    name: "Rowan",
    race: "Human",
    archetype: "Guardian",
    pronouns: "she/her",
    ageBand: "CHILD",
    level: 2,
    stats: { might: 3, wits: 3, heart: 3, spark: 3 },
    skills: [],
    ...overrides,
  };
}

function contextWith(party: PartyMemberContext): string {
  return buildContext({
    campaignTitle: "A Story",
    storylineTitle: "A Storyline",
    premise: "Something happens.",
    actTitle: "Chapter One",
    actGoal: "Get going.",
    actBeats: [],
    party: [party],
    bonds: [],
    priorScenes: [],
    memories: [],
    recentTurns: [],
    currentTurnCounter: 1,
    maxTokens: 4000,
  }).text;
}

test("locked: the storyteller is told what she cannot use yet", () => {
  // Without this the lock was a label on a sheet: the storyteller had no idea
  // the flute was beyond her, so it would let her play it next turn and the
  // requirement would mean nothing at all.
  const text = contextWith(
    member({ lockedItems: [{ name: "a silver flute", needs: "Small Wonders rank 2" }] }),
  );

  assert.match(text, /CANNOT use yet/);
  assert.match(text, /a silver flute \(needs Small Wonders rank 2\)/);
  assert.match(text, /Do not let them use these/);
});

test("locked: a character with nothing locked says nothing about it", () => {
  assert.ok(!contextWith(member()).includes("CANNOT use yet"));
});

test("abilities: what a rank lets her do reaches the storyteller", () => {
  const text = contextWith(member({ skills: [{ name: "Hold Fast", rank: 3 }] }));

  assert.match(text, /Steady Hand \(Hold Fast\)/);
  assert.match(text, /Show Someone How \(Hold Fast\)/);
});

test("abilities: a rank-one skill adds nothing to the prompt", () => {
  const text = contextWith(member({ skills: [{ name: "Hold Fast", rank: 1 }] }));
  assert.ok(!text.includes("Steady Hand"));
});
