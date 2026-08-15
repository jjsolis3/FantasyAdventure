import { strict as assert } from "node:assert";
import { test } from "node:test";
import { actionsFrom, type RoundView } from "../lib/game/rounds.ts";

function roundWith(answers: RoundView["answers"], partyIds: string[]): RoundView {
  return {
    id: "round-1",
    number: 1,
    mode: "ACTION",
    status: "COLLECTING",
    stage: null,
    error: null,
    retelling: false,
    correction: null,
    familyMove: null,
    partyIds,
    answers,
    waitingFor: partyIds.filter((id) => !answers.some((answer) => answer.characterId === id)),
    everyoneIn: partyIds.every((id) => answers.some((answer) => answer.characterId === id)),
    hasActions: answers.some((answer) => !answer.waiting && answer.text.trim().length > 0),
    startsItself: false,
    claimedAt: null,
  };
}

function answer(
  characterId: string,
  text: string,
  waiting = false,
  abilityKey: string | null = null,
  helpingCharacterId: string | null = null,
): RoundView["answers"][number] {
  return {
    characterId,
    text,
    waiting,
    abilityKey,
    helpingCharacterId,
    userId: "u1",
    answeredAt: new Date().toISOString(),
  };
}

test("rounds: answers are told in turn order, not the order they were typed", () => {
  const round = roundWith(
    [answer("c3", "I hang back"), answer("c1", "I open the gate"), answer("c2", "I whistle")],
    ["c1", "c2", "c3"],
  );

  assert.deepEqual(
    actionsFrom(round).map((action) => action.characterId),
    ["c1", "c2", "c3"],
  );
});

test("rounds: waiting and watching is not sent to the storyteller as an action", () => {
  const round = roundWith(
    [answer("c1", "I open the gate"), answer("c2", "", true)],
    ["c1", "c2"],
  );

  assert.deepEqual(actionsFrom(round), [
    { characterId: "c1", text: "I open the gate", abilityKey: null, helpingId: null },
  ]);
});

test("rounds: an answer from somebody no longer in the party is left out", () => {
  const round = roundWith([answer("c1", "I open the gate"), answer("gone", "I wander off")], ["c1"]);

  assert.deepEqual(actionsFrom(round), [
    { characterId: "c1", text: "I open the gate", abilityKey: null, helpingId: null },
  ]);
});

test("rounds: surrounding whitespace does not make an answer look like an action", () => {
  const round = roundWith([answer("c1", "   "), answer("c2", "  I whistle  ")], ["c1", "c2"]);

  assert.deepEqual(actionsFrom(round), [
    { characterId: "c2", text: "I whistle", abilityKey: null, helpingId: null },
  ]);
});

test("rounds: what she is spending travels with what she typed", () => {
  const round = roundWith(
    [answer("c1", "I hold the gate", false, "signature:guardian"), answer("c2", "I slip through")],
    ["c1", "c2"],
  );

  assert.deepEqual(actionsFrom(round), [
    { characterId: "c1", text: "I hold the gate", abilityKey: "signature:guardian", helpingId: null },
    { characterId: "c2", text: "I slip through", abilityKey: null, helpingId: null },
  ]);
});
