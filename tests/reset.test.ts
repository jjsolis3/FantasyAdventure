import { strict as assert } from "node:assert";
import { test } from "node:test";
import { suggestedBuild } from "../lib/game/reset.ts";
import { safeNext } from "../lib/auth/next-path.ts";
import {
  browsableSkills,
  mayChoose,
  reasonFor,
  skillPicksUnspent,
  suggestedSkills,
} from "../lib/game/skill-offer.ts";
import { STATS, STAT_BUDGET, STAT_MAX, STAT_MIN, statBlock, validateStats } from "../lib/game/rules.ts";

const total = (stats: Record<string, number>) => STATS.reduce((sum, stat) => sum + stats[stat], 0);

// ---- Suggesting a build to go back to --------------------------------------

test("reset: a grown character is suggested a legal build", () => {
  // Four evenings of growth: 20 points across four stats, well past the twelve
  // a character is built with.
  const grown = statBlock({ might: 8, wits: 5, heart: 4, spark: 3 });
  const build = suggestedBuild(grown);

  assert.equal(total(build), STAT_BUDGET);
  assert.ok(validateStats(build).ok, validateStats(build).ok ? "" : "suggested an illegal spread");
});

test("reset: the suggestion keeps the shape of who she was", () => {
  // The failure this guards against is flattening. Shaving a point off the
  // highest stat until the total fits is the obvious approach and it turns a
  // Guardian at 8/5/4/3 into 3/3/3/3 — legal, and no longer recognisable as the
  // girl who was strong. Strict inequalities, because the first version of this
  // test used `>=` and passed on exactly that.
  const build = suggestedBuild(statBlock({ might: 8, wits: 5, heart: 4, spark: 3 }));

  assert.ok(build.might > build.wits, `flattened: ${JSON.stringify(build)}`);
  assert.ok(build.wits > build.spark, `flattened: ${JSON.stringify(build)}`);
  assert.ok(validateStats(build).ok);
});

test("reset: the strongest stat stays the strongest", () => {
  for (const stats of [
    statBlock({ might: 9, wits: 3, heart: 2, spark: 2 }),
    statBlock({ might: 2, wits: 12, heart: 3, spark: 2 }),
    statBlock({ might: 4, wits: 4, heart: 9, spark: 3 }),
  ]) {
    const build = suggestedBuild(stats);
    const strongestBefore = STATS.reduce((best, s) => (stats[s] > stats[best] ? s : best), STATS[0]);
    const strongestAfter = STATS.reduce((best, s) => (build[s] > build[best] ? s : best), STATS[0]);

    assert.equal(
      strongestAfter,
      strongestBefore,
      `${JSON.stringify(stats)} became ${JSON.stringify(build)}`,
    );
  }
});

test("reset: a character below budget is topped back up", () => {
  // Possible for anything built under an older rule. A form pre-filled with an
  // illegal spread is just an error message waiting to happen.
  const build = suggestedBuild(statBlock({ might: 2, wits: 2, heart: 2, spark: 2 }));

  assert.equal(total(build), STAT_BUDGET);
  assert.ok(validateStats(build).ok);
});

test("reset: a stat over the build ceiling comes down even when the total is right", () => {
  // Totals twelve, but 9 is beyond what any builder would have allowed, so the
  // spread is still illegal and has to be redistributed rather than accepted.
  const build = suggestedBuild(statBlock({ might: 9, wits: 1, heart: 1, spark: 1 }));

  assert.equal(total(build), STAT_BUDGET);
  for (const stat of STATS) {
    assert.ok(build[stat] <= STAT_MAX, `${stat} left at ${build[stat]}`);
    assert.ok(build[stat] >= STAT_MIN, `${stat} left at ${build[stat]}`);
  }
});

test("reset: a character already at budget is left alone", () => {
  const built = statBlock({ might: 5, wits: 4, heart: 2, spark: 1 });
  assert.deepEqual(suggestedBuild(built), built);
});

test("reset: every plausible sheet gets a legal suggestion", () => {
  // The form disables its own button on an illegal total, so a suggestion that
  // is not legal would present an administrator with a page that cannot be
  // submitted and no way to see why.
  for (let might = 1; might <= 12; might += 1) {
    for (let wits = 1; wits <= 12; wits += 1) {
      const stats = statBlock({ might, wits });
      const build = suggestedBuild(stats);
      assert.ok(
        validateStats(build).ok,
        `${JSON.stringify(stats)} suggested ${JSON.stringify(build)}`,
      );
    }
  }
});

// ---- Where signing in sends you --------------------------------------------

test("reset: a same-site path survives signing in", () => {
  assert.equal(safeNext("/campaigns/abc/play"), "/campaigns/abc/play");
  assert.equal(safeNext("/characters"), "/characters");
});

test("reset: a sign-in form is not an open redirect", () => {
  // The classic way one is introduced. `//host` is protocol-relative, so a
  // browser resolves it against another origin entirely.
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("http://evil.example"), "/");
  // Some browsers normalise a backslash to a slash, which makes this the same
  // trick wearing a different hat.
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("\\\\evil.example"), "/");
});

test("reset: nonsense falls back to the front page", () => {
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext(""), "/");
  assert.equal(safeNext("campaigns"), "/");
});

// ---- What a level hands over ------------------------------------------------

test("skills: a freshly built adventurer owes herself nothing", () => {
  // The bug this catches: the builder's two skills left unstamped read as
  // skills she practised her way into, and the entitlement counts picks rather
  // than skills — so a brand-new character arrived owing herself two choices
  // she had already made.
  assert.equal(skillPicksUnspent({ level: 1, chosen: 2 }), 0);
  assert.equal(skillPicksUnspent({ level: 2, chosen: 2 }), 0);
});

test("skills: one pick per level from the third", () => {
  assert.equal(skillPicksUnspent({ level: 3, chosen: 2 }), 1);
  assert.equal(skillPicksUnspent({ level: 4, chosen: 2 }), 2);
  assert.equal(skillPicksUnspent({ level: 4, chosen: 4 }), 0);
});

test("skills: practising your way to four does not cost you your choices", () => {
  // Four skills on the sheet, none of them chosen — she learned them all by
  // doing them. She should still have every pick her levels gave her.
  assert.equal(skillPicksUnspent({ level: 4, chosen: 0 }), 4);
});

test("skills: suggestions lead with what she keeps doing", () => {
  const input = {
    archetype: "Guardian",
    level: 3,
    held: ["Shield Others", "Hold Fast"],
    chosen: 2,
    practices: [{ key: "climb", label: "climbing", attempts: 3 }],
  };

  const suggested = suggestedSkills(input);
  assert.equal(suggested[0], "Climbing", suggested.join(", "));
  assert.equal(reasonFor("Climbing", input), "you keep doing this");
  // And it never offers something she already has.
  assert.ok(!suggested.includes("Hold Fast"));
});

test("skills: browsing never offers something she already has", () => {
  const input = {
    archetype: "Guardian",
    level: 3,
    held: ["Climbing", "Shield Others"],
    chosen: 2,
    practices: [],
  };

  for (const group of browsableSkills(input)) {
    assert.ok(!group.skills.includes("Climbing"), group.label);
    assert.ok(!group.skills.includes("Shield Others"), group.label);
    assert.ok(group.skills.length > 0, `${group.label} is empty and still shown`);
  }
});

test("skills: the server refuses what the form should not have offered", () => {
  const spent = { archetype: "Guardian", level: 3, held: ["A", "B", "C"], chosen: 3, practices: [] };
  assert.ok(!mayChoose("Climbing", spent), "took a pick she had already spent");

  const held = { archetype: "Guardian", level: 4, held: ["Climbing"], chosen: 2, practices: [] };
  assert.ok(!mayChoose("Climbing", held), "took a skill she already had");
  assert.ok(!mayChoose("Punching People", held), "took a skill that does not exist");
  assert.ok(mayChoose("Swimming", held), "refused a legal choice");
});
