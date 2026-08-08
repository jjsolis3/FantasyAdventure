import assert from "node:assert/strict";
import test from "node:test";
import { generateName, racesWithNames } from "../lib/game/names.ts";
import { ARCHETYPES, RACES } from "../lib/game/character-options.ts";

/** A deterministic stand-in for Math.random that always picks the first entry. */
const first = () => 0;
/** Always picks the last entry. */
const last = () => 0.999999;

test("produces a given name and a two-part surname", () => {
  const name = generateName({ race: "Halfling", archetype: "Beastfriend", random: first });
  const [given, surname, ...extra] = name.split(" ");
  assert.equal(extra.length, 0, `expected two words, got "${name}"`);
  assert.ok(given.length > 0);
  assert.ok(surname.length > given.length / 2);
});

test("given names follow the chosen race", () => {
  assert.match(generateName({ race: "Halfling", random: first }), /^Bitty /);
  assert.match(generateName({ race: "Dwarf", random: first }), /^Bardin /);
  assert.match(generateName({ race: "Sprite", random: first }), /^Bix /);
});

test("an unknown race still gets a name", () => {
  // "Cloud Baker" is a legal race in the builder, so this must not throw.
  const name = generateName({ race: "Cloud Baker", archetype: "Maker", random: first });
  assert.ok(name.includes(" "), name);
  assert.ok(name.length > 3);
});

test("no race and no calling still works", () => {
  const name = generateName({ random: first });
  assert.ok(name.includes(" "), name);
});

test("the calling contributes to the surname", () => {
  // Race parts come first in the pool, so the last entry is always a calling
  // part when a calling is set.
  assert.match(generateName({ race: "Halfling", archetype: "Maker", random: last }), /Craft/);
  assert.match(generateName({ race: "Halfling", archetype: "Songkeeper", random: last }), /Hum/);
});

test("the same race yields different surnames for different callings", () => {
  const maker = generateName({ race: "Elf", archetype: "Maker", random: last });
  const healer = generateName({ race: "Elf", archetype: "Healer", random: last });
  assert.notEqual(maker, healer);
});

test("a surname never simply repeats the given name", () => {
  // "Ember" is both a Fox-folk given name and a Dwarf surname part; the
  // generator should avoid producing "Ember Emberfall".
  for (let seed = 0; seed < 200; seed += 1) {
    const random = () => (seed % 20) / 20;
    for (const race of racesWithNames()) {
      const name = generateName({ race, random });
      const [given, surname] = name.split(" ");
      assert.ok(
        !surname.toLowerCase().startsWith(given.toLowerCase()),
        `"${name}" repeats the given name`,
      );
    }
  }
});

test("every race offered by the builder has bespoke names", () => {
  const named = new Set(racesWithNames());
  for (const race of RACES) {
    assert.ok(named.has(race.value), `${race.value} has no name pool`);
  }
});

test("every calling offered by the builder tints surnames", () => {
  for (const archetype of ARCHETYPES) {
    const withCalling = generateName({ race: "Human", archetype: archetype.value, random: last });
    const without = generateName({ race: "Human", random: last });
    assert.notEqual(
      withCalling,
      without,
      `${archetype.value} does not change the surname pool`,
    );
  }
});

test("repeated calls vary", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 60; index += 1) seen.add(generateName({ race: "Human" }));
  // A child clicking the button should not see the same name twice in a row.
  assert.ok(seen.size > 20, `only ${seen.size} distinct names in 60 rolls`);
});

test("names stay inside the wholesome register", () => {
  // A quick guard against anything unpleasant creeping into the word lists.
  const forbidden = /\b(blood|death|kill|dead|corpse|gore)/i;
  for (let index = 0; index < 500; index += 1) {
    const name = generateName({
      race: racesWithNames()[index % racesWithNames().length],
      archetype: ARCHETYPES[index % ARCHETYPES.length].value,
    });
    assert.ok(!forbidden.test(name), `unwholesome name generated: ${name}`);
  }
});
