import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  completionMessages,
  findMessage,
  listOf,
  resolveDeeds,
  resolveFinds,
  type ObjectiveLike,
} from "../lib/game/quests.ts";

function find(id: string, text: string, done = false): ObjectiveLike {
  return { id, kind: "FIND", text, position: Number(id.slice(1)), doneAtTurn: done ? 1 : null };
}

function deed(id: string, text: string, done = false): ObjectiveLike {
  return { id, kind: "DEED", text, position: Number(id.slice(1)), doneAtTurn: done ? 1 : null };
}

function carried(name: string, holder = "Wren") {
  return { name, holderId: `${holder}-id`, holderName: holder };
}

test("quests: a find is met by something that plausibly matches", () => {
  // The chapter says "the brass key"; the scene wrote it as something longer.
  const resolutions = resolveFinds(
    [find("o1", "the brass key")],
    [carried("a small brass key, green at the teeth")],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].objectiveId, "o1");
  assert.equal(resolutions[0].itemName, "a small brass key, green at the teeth");
  assert.equal(resolutions[0].foundByName, "Wren");
});

test("quests: an objective already met is not met again", () => {
  const resolutions = resolveFinds([find("o1", "brass key", true)], [carried("brass key")]);
  assert.equal(resolutions.length, 0);
});

test("quests: one item cannot tick off two objectives", () => {
  // Otherwise a chapter asking for "a key" and "the brass key" would report
  // itself finished on half the work.
  const resolutions = resolveFinds([find("o1", "a key"), find("o2", "the brass key")], [
    carried("brass key"),
  ]);

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].objectiveId, "o1");
});

test("quests: two matching items satisfy two objectives", () => {
  const resolutions = resolveFinds(
    [find("o1", "brass key"), find("o2", "silver lantern")],
    [carried("brass key", "Wren"), carried("a silver lantern", "Mira")],
  );

  assert.equal(resolutions.length, 2);
  assert.equal(resolutions[1].foundByName, "Mira");
});

test("quests: a deed is only ever matched against one that exists", () => {
  const objectives = [deed("o1", "Get the mill wheel turning again")];

  assert.deepEqual(resolveDeeds(objectives, ["they got the mill wheel turning"]), ["o1"]);
  // A model reporting an achievement nobody asked for changes nothing.
  assert.deepEqual(resolveDeeds(objectives, ["they befriended the goat"]), []);
});

test("quests: a deed already done is not reported twice", () => {
  const objectives = [deed("o1", "Get the mill wheel turning again", true)];
  assert.deepEqual(resolveDeeds(objectives, ["the mill wheel is turning"]), []);
});

test("quests: two reports cannot both claim the same objective", () => {
  const objectives = [deed("o1", "Get the mill wheel turning again")];
  const done = resolveDeeds(objectives, ["the mill wheel turning", "the mill wheel turning again"]);
  assert.deepEqual(done, ["o1"]);
});

test("quests: finds do not answer deeds, and deeds do not answer finds", () => {
  assert.deepEqual(resolveDeeds([find("o1", "the brass key")], ["the brass key"]), []);
  assert.deepEqual(resolveFinds([deed("o1", "the brass key")], [carried("the brass key")]), []);
});

test("quests: finishing says who gave up what", () => {
  // The part a child remembers is that it was theirs and they handed it over.
  const messages = completionMessages({ title: "The Locked Mill", kind: "MAIN" }, [
    { itemName: "the brass key", foundByName: "Wren" },
  ], 8);

  assert.equal(messages[0], "The Locked Mill — done. Wren gave up the brass key.");
  assert.equal(messages[1], "Everyone gains 8 experience for finishing it.");
});

test("quests: finishing with nothing spent still reads as an ending", () => {
  const messages = completionMessages({ title: "The Lost Cat", kind: "SIDE" }, [], 4);
  assert.equal(messages[0], "The Lost Cat — done.");
});

test("quests: everyone who gave something up is named", () => {
  const messages = completionMessages({ title: "The Bridge", kind: "MAIN" }, [
    { itemName: "the toll", foundByName: "Wren" },
    { itemName: "the lantern", foundByName: "Mira" },
  ], 8);

  assert.equal(
    messages[0],
    "The Bridge — done. Wren gave up the toll and Mira gave up the lantern.",
  );
});

test("quests: a find is announced with the name it was actually found under", () => {
  const message = findMessage("The Locked Mill", {
    objectiveId: "o1",
    itemName: "a small brass key",
    foundByCharacterId: "c1",
    foundByName: "Wren",
  });

  assert.equal(
    message,
    "Wren has a small brass key — one of the things The Locked Mill was waiting for.",
  );
});

test("quests: lists read the way somebody would say them", () => {
  assert.equal(listOf([]), "");
  assert.equal(listOf(["a"]), "a");
  assert.equal(listOf(["a", "b"]), "a and b");
  assert.equal(listOf(["a", "b", "c"]), "a, b and c");
});
