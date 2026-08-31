import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  plannedLevel,
  pointsHandedBack,
  suggestedBuild,
  validatePlan,
} from "../lib/game/reset.ts";
import { safeNext } from "../lib/auth/next-path.ts";
import {
  browsableSkills,
  mayChoose,
  reasonFor,
  skillPicksUnspent,
  suggestedSkills,
} from "../lib/game/skill-offer.ts";
import {
  MAX_LEVEL,
  STATS,
  STAT_BUDGET,
  STAT_MAX,
  STAT_MIN,
  XP_PER_STAT_POINT,
  levelFor,
  nextSkillLevel,
  statBlock,
  validateStats,
} from "../lib/game/rules.ts";

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
  // Twelve exactly, which is what a level-one sheet adds up to.
  const built = statBlock({
    might: 4,
    wits: 2,
    heart: 2,
    spark: 1,
    grace: 1,
    luck: 1,
    grit: 1,
  });
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

test("skills: one pick every third level", () => {
  assert.equal(skillPicksUnspent({ level: 3, chosen: 2 }), 0, "levels 1-3 are the builder's two");
  assert.equal(skillPicksUnspent({ level: 4, chosen: 2 }), 1);
  assert.equal(skillPicksUnspent({ level: 7, chosen: 2 }), 2);
  assert.equal(skillPicksUnspent({ level: 7, chosen: 4 }), 0);
});

test("skills: a sheet already over the new entitlement loses nothing", () => {
  // Orin, exactly as the journal found him: level 4 with four skills, on a
  // ladder that now says three. He keeps all four and simply has nothing
  // waiting until level 10 — which is the slowdown, working.
  assert.equal(skillPicksUnspent({ level: 4, chosen: 4 }), 0);
  assert.equal(nextSkillLevel(4, 4), 10);
});

test("skills: practising your way to four does not cost you your choices", () => {
  // Four skills on the sheet, none of them chosen — she learned them all by
  // doing them. She should still have every pick her levels gave her.
  assert.equal(skillPicksUnspent({ level: 7, chosen: 0 }), 4);
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

// ---- Two different things people call "resetting" ---------------------------
//
// A household asked whether they should reset two adventurers so the new growth
// rules applied to them, and said plainly: *"I just don't want the current
// characters to be penalised for no reason."* There was no way to do that. The
// only button available threw away four evenings to fix a spread of numbers.

const legalBuild = statBlock({ might: 3, wits: 2, heart: 2, spark: 2, grace: 1, luck: 1, grit: 1 });

test("plan: the seven boxes add up to the number on the screen", () => {
  // What the old rule got wrong, and it was never the arithmetic: seven boxes
  // adding up to nineteen under a sentence about twelve points. Now the budget
  // IS the total, so a child can check it by adding up.
  assert.equal(total(legalBuild), STAT_BUDGET);
  assert.equal(STAT_BUDGET, 12);
});

test("plan: a grown adventurer may keep what her experience earned", () => {
  // The other half of the family's ask. Re-laying keeps her experience, so the
  // budget it bought comes with it — twelve at level one, and more as she grows.
  const grownBuild = statBlock({ might: 5, wits: 3, heart: 2, spark: 1, grace: 1, luck: 1, grit: 1 });
  assert.equal(total(grownBuild), STAT_BUDGET + 2);

  // Refused for somebody starting again, who is level one with no experience.
  assert.equal(validatePlan({ mode: "START_AGAIN", build: grownBuild }).ok, false);

  // Allowed for a re-lay at experience that has earned two points.
  assert.deepEqual(
    validatePlan({ mode: "RELAY_NUMBERS", build: grownBuild, xp: XP_PER_STAT_POINT * 2 }),
    { ok: true },
  );

  // And still refused when the experience has not earned them.
  assert.equal(validatePlan({ mode: "RELAY_NUMBERS", build: grownBuild, xp: 0 }).ok, false);
});

test("plan: an illegal spread is refused whichever mode it is in", () => {
  const tooMany = statBlock({ might: 5, wits: 5, heart: 5, spark: 5, grace: 5, luck: 5, grit: 5 });

  for (const mode of ["START_AGAIN", "RELAY_NUMBERS"] as const) {
    const outcome = validatePlan({ mode, build: tooMany });
    assert.equal(outcome.ok, false);
  }
});

test("plan: starting again may hand back the two skills a builder would", () => {
  assert.deepEqual(
    validatePlan({ mode: "START_AGAIN", build: legalBuild, skills: ["Climbing", "Bargaining"] }),
    { ok: true },
  );
});

test("plan: and no more than that, and nothing invented", () => {
  const tooMany = validatePlan({
    mode: "START_AGAIN",
    build: legalBuild,
    skills: ["Climbing", "Bargaining", "Swimming"],
  });
  assert.equal(tooMany.ok, false);

  const invented = validatePlan({
    mode: "START_AGAIN",
    build: legalBuild,
    skills: ["Reading Minds"],
  });
  assert.equal(invented.ok, false);

  const twice = validatePlan({
    mode: "START_AGAIN",
    build: legalBuild,
    skills: ["Climbing", "Climbing"],
  });
  assert.equal(twice.ok, false);
});

test("plan: none at all is fine — she is offered two on her own sheet", () => {
  assert.deepEqual(validatePlan({ mode: "START_AGAIN", build: legalBuild, skills: [] }), {
    ok: true,
  });
  assert.deepEqual(validatePlan({ mode: "START_AGAIN", build: legalBuild }), { ok: true });
});

test("plan: re-laying her numbers may leave the level and experience alone", () => {
  assert.deepEqual(validatePlan({ mode: "RELAY_NUMBERS", build: legalBuild }), { ok: true });
});

test("plan: a level off the ladder is refused, and so is negative experience", () => {
  assert.equal(validatePlan({ mode: "RELAY_NUMBERS", build: legalBuild, level: 0 }).ok, false);
  assert.equal(
    validatePlan({ mode: "RELAY_NUMBERS", build: legalBuild, level: MAX_LEVEL + 1 }).ok,
    false,
  );
  assert.equal(validatePlan({ mode: "RELAY_NUMBERS", build: legalBuild, xp: -1 }).ok, false);
  assert.equal(validatePlan({ mode: "RELAY_NUMBERS", build: legalBuild, xp: 2.5 }).ok, false);
});

test("plan: a refusal names the thing that was actually wrong", () => {
  // The budget is derived from the experience, so a nonsense experience used to
  // come back as a complaint about points: `statPointsEarned(-5)` is -1, the
  // budget quietly dropped by one, and a perfectly good spread was reported as
  // costing "1 too many". True, and no help to anybody. The checks that decide
  // whether an input can be believed have to run before anything is built on it.
  const refused = validatePlan({ mode: "RELAY_NUMBERS", build: legalBuild, xp: -5 });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.reason, /experience/i);
  assert.doesNotMatch(refused.ok ? "" : refused.reason, /point/i);
});

test("plan: the budget for re-laying is her own, not everybody's", () => {
  // The complaint that drove this: a level-one adventurer places twelve, and one
  // who has earned five places seventeen. Same rule, two answers.
  const earning = XP_PER_STAT_POINT * 5;
  const seventeen = statBlock({ might: 2, wits: 4, heart: 3, spark: 3, grace: 2, luck: 2, grit: 1 });
  assert.equal(total(seventeen), STAT_BUDGET + 5);

  // Legal for the adventurer who earned it…
  assert.equal(validatePlan({ mode: "RELAY_NUMBERS", build: seventeen, xp: earning }).ok, true);
  // …and refused for the one who has not.
  assert.equal(validatePlan({ mode: "RELAY_NUMBERS", build: seventeen, xp: 0 }).ok, false);
  // Starting again is always the level-one budget, whatever she had before.
  assert.equal(validatePlan({ mode: "START_AGAIN", build: seventeen }, earning).ok, false);
  assert.equal(validatePlan({ mode: "START_AGAIN", build: legalBuild }, earning).ok, true);
});

// ---- Where the level actually lands -----------------------------------------

test("level: omitting both leaves her exactly where she was", () => {
  assert.equal(plannedLevel({}, { level: 4, xp: 45 }), 4);
});

test("level: it may be put above what the experience has paid for", () => {
  // The reason the tool exists: it is for the cases the rules cannot work out.
  assert.equal(plannedLevel({ level: 6 }, { level: 4, xp: 45 }), 6);
});

test("level: but never below it, because the next turn would raise it back", () => {
  // 400 experience is level 6 on the ladder. Setting 2 would be a sheet that
  // corrects itself the moment anybody plays, which looks like a broken form
  // rather than a refused one.
  assert.equal(plannedLevel({ level: 2, xp: 400 }, { level: 6, xp: 400 }), levelFor(400));
  assert.ok(levelFor(400) > 2);
});

test("level: lowering the experience is allowed to lower the level with it", () => {
  // The high-water mark is about play never taking a level away. An
  // administrator saying "put him back to 40 experience" is not play, and the
  // stored level has to follow or the sheet is a lie.
  assert.equal(plannedLevel({ level: 1, xp: 40 }, { level: 6, xp: 400 }), levelFor(40));
});

test("level: it is clamped at the top of the ladder", () => {
  assert.equal(plannedLevel({ level: 999 }, { level: 1, xp: 0 }), MAX_LEVEL);
});

// ---- What re-laying hands back ----------------------------------------------

test("points: how much of the re-laying budget she earned rather than started with", () => {
  // So the screen can say "twelve, plus five you have earned" instead of
  // quoting seventeen and leaving somebody to work out where it came from.
  assert.equal(pointsHandedBack(0), 0);
  assert.equal(pointsHandedBack(XP_PER_STAT_POINT - 1), 0);
  assert.equal(pointsHandedBack(XP_PER_STAT_POINT), 1);
  assert.equal(pointsHandedBack(XP_PER_STAT_POINT * 3 + 5), 3);
});
