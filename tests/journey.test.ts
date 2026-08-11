import { strict as assert } from "node:assert";
import { test } from "node:test";
import { journeyFrom, placesVisited, type SceneLike } from "../lib/game/journey.ts";

function scene(index: number, title: string, location: string | null, actIndex = 1): SceneLike {
  return { index, title, location, actIndex };
}

test("journey: places come out in the order they were visited", () => {
  const stops = journeyFrom([
    scene(1, "The Barley Field", "the barley field"),
    scene(2, "Over the Bridge", "the old bridge"),
    scene(3, "The Mill", "the mill"),
  ]);

  assert.deepEqual(
    stops.map((stop) => stop.location),
    ["the barley field", "the old bridge", "the mill"],
  );
});

test("journey: an evening spent in one place is one stop", () => {
  // Three scenes in the same kitchen is one visit to the kitchen.
  const stops = journeyFrom([
    scene(1, "Supper", "the kitchen"),
    scene(2, "The Argument", "the kitchen"),
    scene(3, "Washing Up", "the kitchen"),
  ]);

  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].scenes, ["Supper", "The Argument", "Washing Up"]);
});

test("journey: the storyteller's own inconsistency does not split a stop", () => {
  // The same field comes back capitalised differently, and with the article
  // dropped. A route listing three barley fields is worse than no route.
  const stops = journeyFrom([
    scene(1, "One", "the barley field"),
    scene(2, "Two", "The Barley Field"),
    scene(3, "Three", "barley field"),
  ]);

  assert.equal(stops.length, 1);
  assert.equal(stops[0].location, "the barley field", "keeps the first spelling");
});

test("journey: going back somewhere is a new stop, and says so", () => {
  const stops = journeyFrom([
    scene(1, "One", "the mill"),
    scene(2, "Two", "the woods"),
    scene(3, "Three", "the mill"),
  ]);

  assert.equal(stops.length, 3);
  assert.equal(stops[0].returning, false);
  assert.equal(stops[2].returning, true, "the third stop is a return to the mill");
});

test("journey: a scene with nowhere named stays where the party was", () => {
  // They did not teleport; the storyteller just did not restate the place.
  const stops = journeyFrom([
    scene(1, "One", "the mill"),
    scene(2, "Two", null),
    scene(3, "Three", "  "),
  ]);

  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].scenes, ["One", "Two", "Three"]);
});

test("journey: scenes before anywhere is named do not invent a stop", () => {
  const stops = journeyFrom([scene(1, "One", null), scene(2, "Two", "the mill")]);

  assert.equal(stops.length, 1);
  assert.equal(stops[0].location, "the mill");
  assert.deepEqual(stops[0].scenes, ["Two"]);
});

test("journey: stops carry where in the story they began", () => {
  const stops = journeyFrom([
    scene(1, "One", "the mill", 1),
    scene(2, "Two", "the woods", 2),
  ]);

  assert.equal(stops[1].sceneIndex, 2);
  assert.equal(stops[1].actIndex, 2);
});

test("journey: scenes out of order are still read in order", () => {
  const stops = journeyFrom([
    scene(3, "Three", "the mill"),
    scene(1, "One", "the barley field"),
    scene(2, "Two", "the woods"),
  ]);

  assert.deepEqual(
    stops.map((stop) => stop.location),
    ["the barley field", "the woods", "the mill"],
  );
});

test("journey: nothing played yet is an empty route, not a crash", () => {
  assert.deepEqual(journeyFrom([]), []);
});

test("journey: coming back does not count as another place", () => {
  const stops = journeyFrom([
    scene(1, "One", "the mill"),
    scene(2, "Two", "the woods"),
    scene(3, "Three", "The Mill"),
  ]);

  assert.equal(stops.length, 3, "three stops on the route");
  assert.equal(placesVisited(stops), 2, "but only two places");
});
