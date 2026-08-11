import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SUPPLIES_PER_CHARACTER, suppliesFor, wasOffered } from "../lib/game/loadout.ts";
import { ARCHETYPES } from "../lib/game/character-options.ts";

test("loadout: everybody is offered the staples", () => {
  // The rope has to be there for anybody who wants the rope.
  const names = suppliesFor("Guardian", "COZY").map((supply) => supply.name);
  assert.ok(names.includes("a coil of rope"));
  assert.ok(names.includes("a lantern"));
});

test("loadout: a calling suggests things of its own", () => {
  const beastfriend = suppliesFor("Beastfriend", "COZY").map((supply) => supply.name);
  const scholar = suppliesFor("Scholar", "COZY").map((supply) => supply.name);

  assert.ok(beastfriend.includes("a bag of seeds"));
  assert.ok(!scholar.includes("a bag of seeds"));
  assert.ok(scholar.includes("a folding glass"));
});

test("loadout: the mood of the story changes what is packed", () => {
  const spooky = suppliesFor("Guardian", "SPOOKY").map((supply) => supply.name);
  const cozy = suppliesFor("Guardian", "COZY").map((supply) => supply.name);

  assert.ok(spooky.includes("a candle that will not blow out"));
  assert.ok(cozy.includes("a flask of something warm"));
  assert.ok(!cozy.includes("a candle that will not blow out"));
});

test("loadout: a calling nobody has heard of still gets a rope", () => {
  // A seven-year-old who wants to be a Cloud Baker packs like everybody else
  // rather than being handed an empty list.
  const supplies = suppliesFor("Cloud Baker", "COZY");

  assert.ok(supplies.length >= 3, String(supplies.length));
  assert.ok(supplies.some((supply) => supply.name === "a coil of rope"));
});

test("loadout: what her calling suggests comes first", () => {
  // The most personal choices are the ones she reads first.
  const supplies = suppliesFor("Maker", "SPOOKY");
  assert.equal(supplies[0].name, "a roll of wire and a bent nail");
});

test("loadout: every calling in the builder has something of its own", () => {
  for (const archetype of ARCHETYPES) {
    const own = suppliesFor(archetype.value, "COZY").filter(
      (supply) => !suppliesFor("Cloud Baker", "COZY").some((base) => base.name === supply.name),
    );
    assert.ok(own.length > 0, `${archetype.value} was offered nothing of its own`);
  }
});

test("loadout: nothing is offered twice", () => {
  for (const tone of ["COZY", "ADVENTUROUS", "SPOOKY"]) {
    for (const archetype of ARCHETYPES) {
      const names = suppliesFor(archetype.value, tone).map((supply) => supply.name);
      assert.equal(new Set(names).size, names.length, `${archetype.value} / ${tone}`);
    }
  }
});

test("loadout: every supply says something about itself", () => {
  // The description is what makes a list of objects into a decision.
  for (const tone of ["COZY", "ADVENTUROUS", "SPOOKY"]) {
    for (const supply of suppliesFor("Guardian", tone)) {
      assert.ok(supply.description.length > 10, supply.name);
    }
  }
});

test("loadout: there is a real choice to make, and a small one", () => {
  // Two, so taking the mirror means not taking the bell. Three is a shopping
  // list; one is not a decision.
  assert.equal(SUPPLIES_PER_CHARACTER, 2);
  assert.ok(suppliesFor("Guardian", "SPOOKY").length > SUPPLIES_PER_CHARACTER + 2);
});

test("loadout: only what she was actually offered can be packed", () => {
  // The check the server does before creating anything, so a hand-posted form
  // cannot conjure a sword.
  assert.ok(wasOffered("Guardian", "COZY", "a coil of rope"));
  assert.ok(wasOffered("Guardian", "COZY", "  A COIL OF ROPE  "), "forgiving about how it arrived");
  assert.equal(wasOffered("Guardian", "COZY", "a sword of great smiting"), undefined);
  assert.equal(
    wasOffered("Guardian", "COZY", "a bag of seeds"),
    undefined,
    "and not another calling's things",
  );
});
