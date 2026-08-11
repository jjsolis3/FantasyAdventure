import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  completionMessages,
  findMessage,
  listOf,
  resolveDeeds,
  questVisibleTo,
  resolveFinds,
  type ObjectiveLike,
} from "../lib/game/quests.ts";
import { QUEST_XP } from "../lib/game/rules.ts";

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

// ---- Personal quests --------------------------------------------------------

test("quests: a personal quest is announced with her name on it", () => {
  // Nobody else knew she was carrying this, so the announcement is a reveal.
  const messages = completionMessages(
    { title: "Make friends with the dog", kind: "PERSONAL", secretForName: "Wren" },
    [],
    6,
  );

  assert.equal(
    messages[0],
    "Wren had something of her own to do: Make friends with the dog — done.",
  );
  assert.equal(messages[1], "Wren gains 6 experience for it.");
});

test("quests: a personal quest pays her, not the party", () => {
  const messages = completionMessages(
    { title: "Make friends with the dog", kind: "PERSONAL", secretForName: "Wren" },
    [],
    6,
  );
  assert.ok(!messages.some((message) => message.includes("Everyone gains")));
});

test("quests: a personal quest that cost her something still says so", () => {
  const messages = completionMessages(
    { title: "Pay the toll", kind: "PERSONAL", secretForName: "Wren" },
    [{ itemName: "the copper coin", foundByName: "Wren" }],
    6,
  );

  assert.equal(
    messages[0],
    "Wren had something of her own to do: Pay the toll — done. Wren gave up the copper coin.",
  );
});

test("quests: a party quest is never attributed to one girl", () => {
  const messages = completionMessages({ title: "The Locked Mill", kind: "MAIN" }, [], 8);
  assert.equal(messages[0], "The Locked Mill — done.");
  assert.equal(messages[1], "Everyone gains 8 experience for finishing it.");
});

test("quests: personal rewards sit between a side quest and a chapter", () => {
  // Worth chasing, without being the fastest way to level.
  assert.ok(QUEST_XP.SIDE < QUEST_XP.PERSONAL);
  assert.ok(QUEST_XP.PERSONAL < QUEST_XP.MAIN);
});

test("quests: a girl sees her own aim and nobody else's", () => {
  const hers = { kind: "PERSONAL" as const, status: "ACTIVE" as const, secretForUserId: "wren-account" };

  assert.equal(questVisibleTo(hers, "wren-account"), true);
  assert.equal(questVisibleTo(hers, "mira-account"), false);
});

test("quests: finishing it tells everybody", () => {
  // The reveal is most of the point; a finished aim is public.
  const done = { kind: "PERSONAL" as const, status: "COMPLETE" as const, secretForUserId: "wren-account" };
  assert.equal(questVisibleTo(done, "mira-account"), true);
  assert.equal(questVisibleTo(done, undefined), true);
});

test("quests: a caller that forgets who is looking reveals nothing", () => {
  // The safe direction to be wrong in.
  const hers = { kind: "PERSONAL" as const, status: "ACTIVE" as const, secretForUserId: "wren-account" };
  assert.equal(questVisibleTo(hers, undefined), false);
});

test("quests: party quests are never hidden from anyone", () => {
  for (const kind of ["MAIN", "SIDE"] as const) {
    const quest = { kind, status: "ACTIVE" as const, secretForUserId: null };
    assert.equal(questVisibleTo(quest, undefined), true, kind);
    assert.equal(questVisibleTo(quest, "anybody"), true, kind);
  }
});
