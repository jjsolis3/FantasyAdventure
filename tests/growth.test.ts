import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  STAT_BUDGET,
  STAT_CEILING,
  STAT_MAX,
  XP_PER_STAT_POINT,
  canRaise,
  statModifier,
  statPointsEarned,
  statPointsUnspent,
  validateStats,
  type StatBlock,
} from "../lib/game/rules.ts";
import {
  ATTEMPTS_TO_LEARN,
  MAX_SKILLS,
  coveredBy,
  hasRequirement,
  lockedFor,
  practiceKey,
  readyToLearn,
  skillNameFrom,
} from "../lib/game/practice.ts";
import { ARCHETYPES, signatureFor } from "../lib/game/character-options.ts";

const built: StatBlock = { might: 3, wits: 3, heart: 3, spark: 3 };

// ---- Stats that grow --------------------------------------------------------

test("growth: one point every ten experience", () => {
  assert.equal(statPointsEarned(0), 0);
  assert.equal(statPointsEarned(9), 0);
  assert.equal(statPointsEarned(10), 1);
  assert.equal(statPointsEarned(95), 9);
  assert.equal(XP_PER_STAT_POINT, 10);
});

test("growth: a freshly built character has nothing to spend", () => {
  assert.equal(statPointsUnspent(built, 0), 0);
});

test("growth: what she has spent is read off the sheet, not stored", () => {
  // 30 xp earns 3 points; two are already in Might, so one is left.
  const spentTwo: StatBlock = { ...built, might: 5 };
  assert.equal(statPointsUnspent(spentTwo, 30), 1);
});

test("growth: spending them all leaves none", () => {
  const spentThree: StatBlock = { ...built, might: 5, wits: 4 };
  assert.equal(statPointsUnspent(spentThree, 30), 0);
});

test("growth: taking a turn back cannot leave her owing points", () => {
  // Undo restores xp, so a character can briefly have spent more than she has
  // earned. That must read as zero rather than a negative.
  const spentThree: StatBlock = { ...built, might: 5, wits: 4 };
  assert.equal(statPointsUnspent(spentThree, 0), 0);
});

test("growth: a stat stops at the ceiling even with points in hand", () => {
  const maxed: StatBlock = { ...built, might: STAT_CEILING };
  assert.equal(canRaise(maxed, 10_000, "might"), false);
  assert.equal(canRaise(maxed, 10_000, "wits"), true);
});

test("growth: nothing can be raised without a point to spend", () => {
  assert.equal(canRaise(built, 0, "might"), false);
});

test("growth: the sheet fills far past where it was built", () => {
  // Twenty at the outset; forty-eight at the far end of a long career.
  assert.equal(STAT_MAX * 4, 20);
  assert.equal(STAT_CEILING * 4, 48);
  assert.ok(STAT_CEILING > STAT_MAX);
  assert.equal(STAT_BUDGET, 12);
});

// ---- The curve --------------------------------------------------------------

test("growth: no existing adventurer is worth less than she was", () => {
  // Everything a character could be built at keeps exactly the modifier it had.
  assert.equal(statModifier(1), -2);
  assert.equal(statModifier(3), 0);
  assert.equal(statModifier(5), 2);
});

test("growth: above five, two points buy one", () => {
  assert.equal(statModifier(6), 3);
  assert.equal(statModifier(7), 3);
  assert.equal(statModifier(8), 4);
  assert.equal(statModifier(9), 4);
  assert.equal(statModifier(12), 6);
});

test("growth: the dice still matter at the very top", () => {
  // A HARD check targets 16. Maxed out and with no skill, she still needs a 10
  // on a d20 — which is the whole reason the curve exists.
  const best = statModifier(STAT_CEILING);
  assert.equal(16 - best, 10);
});

test("growth: the curve never goes backwards", () => {
  for (let value = 1; value < STAT_CEILING; value += 1) {
    assert.ok(
      statModifier(value + 1) >= statModifier(value),
      `${value} -> ${value + 1} went down`,
    );
  }
});

// ---- Practice ---------------------------------------------------------------

test("practice: the same act said three ways is counted once", () => {
  // The storyteller will not use the same word twice running.
  const keys = ["climbing", "Climb", "climbed", "climbs"].map(practiceKey);
  assert.equal(new Set(keys).size, 1, keys.join(", "));
});

test("practice: only the first word counts", () => {
  assert.equal(practiceKey("climbing up a drainpipe"), practiceKey("climbing"));
});

test("practice: four honest tries make a skill", () => {
  const almost = { key: "climb", label: "climbing", attempts: 3, learnedAtTurn: null };
  const enough = { ...almost, attempts: ATTEMPTS_TO_LEARN };

  assert.equal(readyToLearn(almost, []), false);
  assert.equal(readyToLearn(enough, []), true);
});

test("practice: failing still teaches you something", () => {
  // Nothing here looks at outcomes. A child who has failed to pick a lock four
  // times has learned a great deal about locks.
  const failed = { key: "pick", label: "picking locks", attempts: 4, learnedAtTurn: null };
  assert.equal(readyToLearn(failed, []), true);
});

test("practice: something already learned is not learned twice", () => {
  const done = { key: "climb", label: "climbing", attempts: 9, learnedAtTurn: 3 };
  assert.equal(readyToLearn(done, []), false);
});

test("practice: a skill she already has covers it", () => {
  const practice = { key: "speak", label: "speaking", attempts: 5, learnedAtTurn: null };
  const skills = [{ name: "Speak with Animals", rank: 2 }];

  assert.equal(coveredBy("speak", skills), true);
  assert.equal(readyToLearn(practice, skills), false);
});

test("practice: an unrelated skill does not cover it", () => {
  assert.equal(coveredBy("climb", [{ name: "Speak with Animals", rank: 2 }]), false);
});

test("practice: a full sheet stops collecting", () => {
  const practice = { key: "climb", label: "climbing", attempts: 9, learnedAtTurn: null };
  const full = Array.from({ length: MAX_SKILLS }, (_, index) => ({
    name: `Thing ${index}`,
    rank: 1,
  }));

  assert.equal(readyToLearn(practice, full), false);
});

test("practice: a very short word is never a skill", () => {
  // "go", "be" and the like are noise, and would collide with everything.
  assert.equal(coveredBy("go", [{ name: "Going Places", rank: 1 }]), false);
});

test("practice: a skill arrives named the way a sheet wants it", () => {
  assert.equal(skillNameFrom("climbing"), "Climbing");
  assert.equal(skillNameFrom("  picking locks "), "Picking Locks");
});

// ---- Things you have not grown into yet -------------------------------------

const none = { requiresSkill: null, requiresRank: null, requiresLevel: null };

test("locked: almost everything is just an object", () => {
  assert.equal(hasRequirement(none), false);
  assert.equal(lockedFor(none, { level: 1, skills: [] }).locked, false);
});

test("locked: a thing she is not ready for says what it needs", () => {
  const flute = { requiresSkill: "Small Wonders", requiresRank: 2, requiresLevel: null };
  const lock = lockedFor(flute, { level: 4, skills: [{ name: "Small Wonders", rank: 1 }] });

  assert.equal(lock.locked, true);
  assert.equal(lock.locked && lock.needs, "Small Wonders rank 2");
});

test("locked: growing into it unlocks it", () => {
  const flute = { requiresSkill: "Small Wonders", requiresRank: 2, requiresLevel: null };
  assert.equal(
    lockedFor(flute, { level: 4, skills: [{ name: "Small Wonders", rank: 2 }] }).locked,
    false,
  );
});

test("locked: having none of the skill still names the rank she will need", () => {
  // "Needs Small Wonders" would send her off to learn it and leave her still
  // unable to use the thing.
  const flute = { requiresSkill: "Small Wonders", requiresRank: 2, requiresLevel: null };
  const lock = lockedFor(flute, { level: 9, skills: [] });

  assert.equal(lock.locked, true);
  assert.equal(lock.locked && lock.needs, "Small Wonders rank 2");
});

test("locked: a first-rank requirement does not bother saying so", () => {
  const book = { requiresSkill: "Recall Lore", requiresRank: 1, requiresLevel: null };
  const lock = lockedFor(book, { level: 9, skills: [] });

  assert.equal(lock.locked && lock.needs, "Recall Lore");
});

test("locked: a plain level requirement works too", () => {
  const book = { requiresSkill: null, requiresRank: null, requiresLevel: 5 };

  assert.equal(lockedFor(book, { level: 4, skills: [] }).locked, true);
  assert.equal(lockedFor(book, { level: 5, skills: [] }).locked, false);
});

// ---- Signature moves --------------------------------------------------------

test("signature: every calling in the builder has one of its own", () => {
  const names = new Set<string>();

  for (const archetype of ARCHETYPES) {
    const signature = signatureFor(archetype.value);
    assert.ok(signature, `${archetype.value} has no signature`);
    assert.ok(signature!.blurb.length > 20, archetype.value);
    assert.ok(signature!.narrationHint.length > 20, archetype.value);
    names.add(signature!.name);
  }

  assert.equal(names.size, ARCHETYPES.length, "two callings share a signature");
});

test("signature: a calling nobody has heard of simply has none", () => {
  // The Cloud Baker is not worse off than she was — a signature is something
  // eight callings gained, not something anybody lost.
  assert.equal(signatureFor("Cloud Baker"), undefined);
});

test("signature: found however it was capitalised", () => {
  assert.equal(signatureFor("  guardian ")?.name, signatureFor("Guardian")?.name);
});

// ---- Saving a grown adventurer ----------------------------------------------

test("growth: a grown sheet is not something the builder's rule can describe", () => {
  // She earned three points and spent them, so her sheet legitimately adds up
  // to more than the build budget. The editor no longer writes stats at all,
  // which is why this can be true and safe at the same time.
  const grown: StatBlock = { might: 5, wits: 4, heart: 3, spark: 3 };

  assert.equal(validateStats(grown).ok, false, "the build rule rejects it, correctly");
  assert.equal(statPointsUnspent(grown, 30), 0, "and she has spent exactly what she earned");
});
