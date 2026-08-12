import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  abilitiesFor,
  rankAbilityKey,
  scopeLabel,
  unspentAbilities,
  windowKeyFor,
} from "../lib/game/abilities.ts";
import { ARCHETYPES } from "../lib/game/character-options.ts";
import { resolveCheck } from "../lib/engine/dice.ts";
import type { StatKey } from "../lib/game/rules.ts";

const STATS: Record<StatKey, number> = { might: 10, wits: 10, heart: 10, spark: 10 };

/** A roll that always lands on the same face, so an outcome means something. */
const always = (value: number) => () => value;

// ---- The catalogue ----------------------------------------------------------

test("abilities: every calling brings its signature", () => {
  for (const archetype of ARCHETYPES) {
    const owned = abilitiesFor({ archetype: archetype.value, knackKeys: [], skills: [] });
    const signature = owned.find((ability) => ability.kind === "SIGNATURE");

    assert.ok(signature, `${archetype.value} has no signature`);
    assert.equal(signature.name, archetype.signature.name);
    // Once a scene, which is what the doc comment has claimed since they were
    // written and what nothing enforced until now.
    assert.equal(signature.scope, "SCENE");
  }
});

test("abilities: a knack with no limit is not something to spend", () => {
  // Sure-footed is a flat +1. Putting it on the picker would offer a child a
  // button that does nothing, once, and then stops existing.
  const owned = abilitiesFor({
    archetype: "Beastfriend",
    knackKeys: ["sure_footed", "deep_pockets", "good_listener"],
    skills: [],
  });

  const names = owned.map((ability) => ability.key);
  assert.ok(names.includes("knack:good_listener"), "the once-a-chapter one is missing");
  assert.ok(!names.some((key) => key.includes("sure_footed")));
  assert.ok(!names.some((key) => key.includes("deep_pockets")));
});

test("abilities: Steady Hand arrives once the skill is practised far enough", () => {
  const notYet = abilitiesFor({
    archetype: "Maker",
    knackKeys: [],
    skills: [{ name: "Climbing", rank: 1 }],
  });
  assert.ok(!notYet.some((ability) => ability.kind === "RANK"));

  const earned = abilitiesFor({
    archetype: "Maker",
    knackKeys: [],
    skills: [{ name: "Climbing", rank: 2 }],
  });
  const steady = earned.find((ability) => ability.kind === "RANK");
  assert.ok(steady);
  assert.equal(steady.key, rankAbilityKey("Climbing"));
  assert.equal(steady.scope, "ACT");
});

test("abilities: two practised skills are two separate Steady Hands", () => {
  // They are different abilities — one is "climb it without rolling", the other
  // is "hum it without rolling" — so spending one must not spend the other.
  const owned = abilitiesFor({
    archetype: "Songkeeper",
    knackKeys: [],
    skills: [
      { name: "Climbing", rank: 2 },
      { name: "Humming", rank: 3 },
    ],
  });

  const keys = owned.filter((ability) => ability.kind === "RANK").map((ability) => ability.key);
  assert.equal(new Set(keys).size, 2, keys.join(", "));
});

// ---- The limit --------------------------------------------------------------

test("abilities: a signature spent this scene is gone until the next one", () => {
  const owned = abilitiesFor({ archetype: "Guardian", knackKeys: [], skills: [] });
  const signature = owned[0];
  const spent = [{ abilityKey: signature.key, windowKey: windowKeyFor("SCENE", "scene-1", 1) }];

  assert.equal(unspentAbilities(owned, spent, "scene-1", 1).length, 0, "still offered in the scene");
  assert.equal(unspentAbilities(owned, spent, "scene-2", 1).length, 1, "not back next scene");
});

test("abilities: a once-a-chapter move survives a change of scene", () => {
  // The bug this guards against is the quiet one: measure a chapter-scoped
  // ability against the scene and it silently becomes once per scene, which in
  // a long evening is four or five times what it should be.
  const owned = abilitiesFor({
    archetype: "Scholar",
    knackKeys: ["good_listener"],
    skills: [],
  });
  const knack = owned.find((ability) => ability.kind === "KNACK")!;
  const spent = [{ abilityKey: knack.key, windowKey: windowKeyFor("ACT", "scene-1", 1) }];

  const nextScene = unspentAbilities(owned, spent, "scene-2", 1);
  assert.ok(
    !nextScene.some((ability) => ability.key === knack.key),
    "came back a scene later — the limit is measured in the wrong window",
  );

  const nextChapter = unspentAbilities(owned, spent, "scene-9", 2);
  assert.ok(nextChapter.some((ability) => ability.key === knack.key), "never came back at all");
});

test("abilities: spending one leaves the others alone", () => {
  const owned = abilitiesFor({
    archetype: "Guardian",
    knackKeys: ["good_listener"],
    skills: [{ name: "Climbing", rank: 2 }],
  });
  assert.equal(owned.length, 3);

  const spent = [{ abilityKey: owned[0].key, windowKey: windowKeyFor(owned[0].scope, "s1", 1) }];
  assert.equal(unspentAbilities(owned, spent, "s1", 1).length, 2);
});

test("abilities: the two windows cannot collide", () => {
  assert.notEqual(windowKeyFor("SCENE", "1", 1), windowKeyFor("ACT", "1", 1));
});

test("abilities: the limit is described the way a child would say it", () => {
  assert.equal(scopeLabel("SCENE"), "Once a scene");
  assert.equal(scopeLabel("ACT"), "Once a chapter");
});

// ---- What spending one actually does ---------------------------------------

test("abilities: an auto-succeed move turns a miss into a success", () => {
  const request = {
    characterId: "c1",
    characterName: "Mira",
    stat: "might" as StatKey,
    difficulty: "HARD" as const,
    intent: "hold the gate",
  };

  const missed = resolveCheck(request, STATS, always(3));
  assert.equal(missed.outcome, "COMPLICATION");

  const spent = resolveCheck(request, STATS, always(3), undefined, {
    own: { name: "Step In", effect: { kind: "AUTO_SUCCEED" } },
  });
  assert.equal(spent.outcome, "SUCCESS");
  assert.match(spent.ability?.note ?? "", /simply works/);
});

test("abilities: spending one never takes a natural 20 away", () => {
  // The meanest possible interaction: a child rolls a 20 on the turn she spends
  // the thing she has been saving, and is downgraded to an ordinary success.
  const result = resolveCheck(
    {
      characterId: "c1",
      characterName: "Mira",
      stat: "might" as StatKey,
      difficulty: "HARD" as const,
      intent: "hold the gate",
    },
    STATS,
    always(20),
    undefined,
    { own: { name: "Step In", effect: { kind: "AUTO_SUCCEED" } } },
  );

  assert.equal(result.outcome, "CRITICAL");
});

test("abilities: a boost helps the roll and says who to thank", () => {
  const request = {
    characterId: "c1",
    characterName: "Mira",
    stat: "wits" as StatKey,
    difficulty: "NORMAL" as const,
    intent: "work out the latch",
  };

  const alone = resolveCheck(request, STATS, always(11));
  const carried = resolveCheck(request, STATS, always(11), undefined, {
    boost: { amount: 2, fromName: "Tam" },
  });

  assert.equal(carried.total, alone.total + 2);
  assert.match(carried.ability?.note ?? "", /Tam carries them/);
});

test("abilities: a Family Move and a spent move can land on the same roll", () => {
  // Both are legal on one check — a sister lends a hand on the turn a girl
  // spends Steady Hand — and when they do, "it simply works" has to win.
  const result = resolveCheck(
    {
      characterId: "c1",
      characterName: "Mira",
      stat: "might" as StatKey,
      difficulty: "HARD" as const,
      intent: "shift the beam",
    },
    STATS,
    always(2),
    { key: "lend_a_hand", moveName: "Lend a Hand", helperName: "Tam" },
    { own: { name: "Steady Hand — Lifting", effect: { kind: "AUTO_SUCCEED" } } },
  );

  assert.equal(result.outcome, "SUCCESS");
  assert.match(result.move?.note ?? "", /lends a hand/);
});

test("abilities: an archetype nobody recognises costs her only the signature", () => {
  // Callings can be renamed, and a character built under the old name is still
  // somebody's character. She should lose her signature, not her knacks.
  const owned = abilitiesFor({
    archetype: "Beekeeper",
    knackKeys: ["good_listener"],
    skills: [{ name: "Climbing", rank: 2 }],
  });

  assert.ok(!owned.some((ability) => ability.kind === "SIGNATURE"));
  assert.equal(owned.length, 2);
});
