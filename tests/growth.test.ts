import { strict as assert } from "node:assert";
import { test } from "node:test";
import { NEUTRAL_STAT, POINTS_TO_SPEND, STATS, STAT_BUDGET, STAT_CEILING, STAT_MAX, STAT_MIN, XP_PER_STAT_POINT, canRaise, statBlock, statModifier, statPointsEarned, statPointsUnspent, validateStats, type StatBlock } from "../lib/game/rules.ts";
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
import { ARCHETYPES, signaturesFor } from "../lib/game/character-options.ts";

// A legal freshly-built sheet under today's rule: floor everywhere, twelve
// points spent. It used to be four threes and nothing else said, back when the
// builder handed out three in every stat — which is exactly the assumption this
// whole change removed.
const built: StatBlock = statBlock({
  might: 3,
  wits: 3,
  heart: 3,
  spark: 3,
  grace: 3,
  luck: 2,
  grit: 2,
});

// ---- Stats that grow --------------------------------------------------------

test("growth: one point every forty experience", () => {
  // Forty rather than ten since the rebalance: an evening is roughly one point,
  // and the 49 points of growth on a seven-stat sheet now cost 1960 — just
  // under the 2080 the level ladder ends at, which is the relationship those
  // two numbers are meant to have.
  assert.equal(statPointsEarned(0), 0);
  assert.equal(statPointsEarned(39), 0);
  assert.equal(statPointsEarned(40), 1);
  assert.equal(statPointsEarned(380), 9);
  assert.equal(XP_PER_STAT_POINT, 40);
});

test("growth: a freshly built character has nothing to spend", () => {
  assert.equal(statPointsUnspent(built, 0), 0);
});

test("growth: what she has spent is read off the sheet, not stored", () => {
  // 120 xp earns 3 points; two are already in Might, so one is left.
  const spentTwo: StatBlock = { ...built, might: 5 };
  assert.equal(statPointsUnspent(spentTwo, 120), 1);
});

test("growth: spending them all leaves none", () => {
  const spentThree: StatBlock = { ...built, might: 5, wits: 4 };
  assert.equal(statPointsUnspent(spentThree, 120), 0);
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
  // The whole reason growth exists. A built sheet is nineteen points; a filled
  // one is eighty-four, which takes hundreds of experience and is meant to.
  assert.equal(STAT_BUDGET, 19);
  assert.equal(STAT_CEILING * STATS.length, 84);
  assert.ok(STAT_CEILING > STAT_MAX);

  // Stated as a relationship rather than a literal — see the note in
  // rules.test.ts. This is the second time the budget has moved, and both times
  // it was the literal that made it dangerous.
  assert.equal(STAT_BUDGET, STATS.length * STAT_MIN + POINTS_TO_SPEND);

  // And an average new adventurer now starts *below* the value that rolls at
  // +0, which is the point: competence is something play pays for.
  assert.ok(STAT_BUDGET / STATS.length < NEUTRAL_STAT);
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

test("signature: every calling has two of its own, and they are all distinct", () => {
  const names = new Set<string>();

  for (const archetype of ARCHETYPES) {
    const signatures = signaturesFor(archetype.value);
    assert.equal(signatures.length, 2, `${archetype.value} has ${signatures.length}`);

    for (const signature of signatures) {
      assert.ok(signature.blurb.length > 20, `${archetype.value}: ${signature.name}`);
      assert.ok(signature.narrationHint.length > 20, `${archetype.value}: ${signature.name}`);
      names.add(signature.name);
    }
  }

  // Two callings sharing a move would make the sheet's "Guardian only" a lie.
  assert.equal(names.size, ARCHETYPES.length * 2, "two callings share a signature");
});

test("signature: the second one waits for level five", () => {
  for (const archetype of ARCHETYPES) {
    assert.equal(signaturesFor(archetype.value, 1).length, 1, archetype.value);
    assert.equal(signaturesFor(archetype.value, 4).length, 1, archetype.value);
    assert.equal(signaturesFor(archetype.value, 5).length, 2, archetype.value);
  }
});

test("signature: a calling nobody has heard of simply has none", () => {
  // The Cloud Baker is not worse off than she was — a signature is something
  // eight callings gained, not something anybody lost.
  assert.deepEqual(signaturesFor("Cloud Baker"), []);
});

test("signature: found however it was capitalised", () => {
  assert.deepEqual(signaturesFor("  guardian "), signaturesFor("Guardian"));
});

// ---- Saving a grown adventurer ----------------------------------------------

test("growth: a grown sheet is not something the builder's rule can describe", () => {
  // She earned three points and spent them, so her sheet legitimately adds up
  // to more than the build budget. The editor no longer writes stats at all,
  // which is why this can be true and safe at the same time.
  const grown: StatBlock = statBlock({ might: 5, wits: 4, heart: 3, spark: 3 });

  assert.equal(validateStats(grown).ok, false, "the build rule rejects it, correctly");
  assert.equal(statPointsUnspent(grown, 120), 0, "and she has spent exactly what she earned");
});

test("growth: an adventurer built under the old rule keeps every point she earned", () => {
  // The trap this whole `buildBudget` column exists to avoid.
  //
  // The build budget moved from 21 to 19. Growth is measured as how far a sheet
  // has risen above what it *started* at — so reading that off today's constant
  // would have told every adventurer already in the house that she had spent
  // two points she never spent. Silently. With no message. Taking two earned
  // growth points off a child who had played for them.
  const OLD_BUDGET = 21;
  const oldStyle: StatBlock = statBlock({}); // seven threes, exactly the old rule

  assert.equal(STATS.reduce((sum, stat) => sum + oldStyle[stat], 0), OLD_BUDGET);

  // A hundred and twenty experience earns three points, and she has spent none.
  assert.equal(statPointsUnspent(oldStyle, 120, OLD_BUDGET), 3);

  // Measured against today's rule instead, she would be two short.
  assert.equal(statPointsUnspent(oldStyle, 120), 1);
});

test("growth: a new adventurer is measured against the rule she was built with", () => {
  assert.equal(statPointsUnspent(built, 120, STAT_BUDGET), 3);
  assert.equal(statPointsUnspent(built, 0, STAT_BUDGET), 0);
});
