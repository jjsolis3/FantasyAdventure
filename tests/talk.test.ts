import test from "node:test";
import assert from "node:assert/strict";
import { QUIET_PASSAGES, talkNudge, turnsSinceTalking } from "../lib/game/talk.ts";
import { anotherMessage, closerMessage } from "../lib/game/rules.ts";

/**
 * The game asking them to talk, and saying what it was worth.
 *
 * Both halves are pure functions on purpose: what fires when is the part a
 * parent will want to argue with after an evening, and it should be arguable
 * without a database.
 */

const QUIET = { level: 0, limit: 8, owed: false };

const narration = (id: number) => ({ type: "NARRATION", metadata: null, id });
const said = () => ({ type: "PLAYER_ACTION", metadata: { spoken: true } });
const tried = () => ({ type: "PLAYER_ACTION", metadata: null });

// ---- Counting the quiet -----------------------------------------------------

test("talk: a scene with no conversation counts every passage", () => {
  assert.equal(turnsSinceTalking([narration(1), narration(2), narration(3)]), 3);
});

test("talk: the count restarts at the last conversation", () => {
  // Three passages in the scene. The one right after the conversation is the
  // conversation's own, so exactly one has landed since they spoke.
  const turns = [narration(1), said(), narration(2), narration(3)];
  assert.equal(turnsSinceTalking(turns), 1);
});

test("talk: the conversation's own passage does not count against it", () => {
  // `talkTurn` writes the words and then a passage about them, so walking back
  // always crosses one narration that *is* the conversation.
  assert.equal(turnsSinceTalking([narration(1), said(), narration(2)]), 0);
});

test("talk: an attempt is not a conversation", () => {
  // The distinction the whole feature rests on: writing "I open the cupboard"
  // is not saying anything to anybody.
  assert.equal(turnsSinceTalking([narration(1), tried(), narration(2)]), 2);
});

test("talk: a conversation just held counts as zero", () => {
  assert.equal(turnsSinceTalking([narration(1), narration(2), said()]), 0);
});

test("talk: an empty scene is zero, not a nudge", () => {
  assert.equal(turnsSinceTalking([]), 0);
});

// ---- Which moment fires -----------------------------------------------------

test("talk: nothing before the story has said anything", () => {
  const moment = talkNudge({
    encounterName: "The Hollow Man",
    soloed: false,
    sinceTalking: 0,
    passages: 0,
    clock: QUIET,
  });
  assert.equal(moment, null);
});

test("talk: something standing in front of them wins", () => {
  const moment = talkNudge({
    encounterName: "The Hollow Man",
    soloed: false,
    sinceTalking: 0,
    passages: 5,
    clock: QUIET,
  });
  assert.equal(moment?.key, "encounter");
  assert.match(moment!.reason, /The Hollow Man/);
});

test("talk: somebody who has claimed it is not asked to confer about it", () => {
  // "I've got this" is a wager she made on purpose. The game turning round and
  // suggesting the table discuss it would be the game taking it back.
  const moment = talkNudge({
    encounterName: "The Hollow Man",
    soloed: true,
    sinceTalking: 1,
    passages: 5,
    clock: QUIET,
  });
  assert.equal(moment, null);
});

test("talk: a clock nearly out beats a new scene", () => {
  const moment = talkNudge({
    encounterName: null,
    soloed: false,
    sinceTalking: 0,
    passages: 1,
    clock: { level: 7, limit: 8, owed: false },
  });
  assert.equal(moment?.key, "clock");
});

test("talk: a clock at one of eight is not a reason for anything", () => {
  const moment = talkNudge({
    encounterName: null,
    soloed: false,
    sinceTalking: 1,
    passages: 3,
    clock: { level: 1, limit: 8, owed: false },
  });
  assert.equal(moment, null);
});

test("talk: a clock that has run out still asks", () => {
  const moment = talkNudge({
    encounterName: null,
    soloed: false,
    sinceTalking: 0,
    passages: 4,
    clock: { level: 8, limit: 8, owed: true },
  });
  assert.equal(moment?.key, "clock");
});

test("talk: the opening passage of a scene asks", () => {
  const moment = talkNudge({
    encounterName: null,
    soloed: false,
    sinceTalking: 1,
    passages: 1,
    clock: QUIET,
  });
  assert.equal(moment?.key, "opening");
});

test("talk: a long quiet stretch asks", () => {
  const moment = talkNudge({
    encounterName: null,
    soloed: false,
    sinceTalking: QUIET_PASSAGES,
    passages: 9,
    clock: QUIET,
  });
  assert.equal(moment?.key, "quiet");
});

test("talk: a party mid-scene getting on with it is left alone", () => {
  const moment = talkNudge({
    encounterName: null,
    soloed: false,
    sinceTalking: QUIET_PASSAGES - 1,
    passages: 6,
    clock: QUIET,
  });
  assert.equal(moment, null);
});

test("talk: never more than one thing at a time", () => {
  // Every reason firing at once still produces one line. Four suggestions
  // stacked up is a wall of advice, which is the opposite of a nudge.
  const moment = talkNudge({
    encounterName: "The Hollow Man",
    soloed: false,
    sinceTalking: 12,
    passages: 1,
    clock: { level: 8, limit: 8, owed: true },
  });
  assert.equal(moment?.key, "encounter");
});

test("talk: no reason ever says what to talk about", () => {
  const reasons = [
    talkNudge({ encounterName: "A dog", soloed: false, sinceTalking: 0, passages: 3, clock: QUIET }),
    talkNudge({
      encounterName: null,
      soloed: false,
      sinceTalking: 0,
      passages: 1,
      clock: QUIET,
    }),
    talkNudge({
      encounterName: null,
      soloed: false,
      sinceTalking: 9,
      passages: 9,
      clock: QUIET,
    }),
    talkNudge({
      encounterName: null,
      soloed: false,
      sinceTalking: 0,
      passages: 3,
      clock: { level: 8, limit: 8, owed: true },
    }),
  ];

  for (const moment of reasons) {
    assert.ok(moment, "every one of these should fire");
    // A nudge points at the button. The moment it starts naming an object or a
    // person, it has stopped being an invitation and started being the answer.
    assert.doesNotMatch(moment!.reason, /\byou should\b|\btry\b|\bask (him|her|them)\b/i);
  }
});

// ---- What it earned ---------------------------------------------------------

test("talk: a deepened bond says so in words a child can read", () => {
  assert.equal(closerMessage("Mira", "Rowan", 2), "Mira and Rowan grew closer — bond 2.");
});

test("talk: a bond below level one is not announced as bond zero", () => {
  // It climbs several points before it reaches level 1, and "bond 0" reads as
  // being told the thing she just did was worth nothing.
  assert.equal(closerMessage("Mira", "Rowan", 0), "Mira and Rowan grew closer.");
});

test("talk: a second one of something is announced in English", () => {
  assert.equal(
    anotherMessage("Mira", "a smooth grey stone"),
    "Mira picks up another smooth grey stone.",
  );
  // Nothing to strip, nothing stripped.
  assert.equal(anotherMessage("Rowan", "rope"), "Rowan picks up another rope.");
  // And never mid-word: "anchor" does not start with an article.
  assert.equal(anotherMessage("Rowan", "anchor"), "Rowan picks up another anchor.");
});
