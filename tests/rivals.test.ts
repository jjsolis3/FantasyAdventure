import test from "node:test";
import assert from "node:assert/strict";
import { isRivalOutcome, mayAppear, rivalNote, standings } from "../lib/game/rivals.ts";
import { extractionSchema } from "../lib/ai/schemas.ts";

const bex = {
  name: "Bex Underhill",
  about: "A boy with a very good coat who has never once admitted to being wrong.",
  wants: "To be the one who found it, and to be asked about it afterwards.",
  partyAhead: 0,
  rivalAhead: 0,
};

test("somebody never met may turn up at once", () => {
  // A nemesis nobody has met is a row in a database.
  assert.equal(mayAppear({ lastSeenCampaignId: null, lastSeenActIndex: null }, "c1", 1), true);
});

test("and then not again until the next chapter", () => {
  // A rival in every scene is a co-star. Chapters are the rhythm a rivalry
  // reads at, and it lets the storyteller build to a meeting rather than being
  // interrupted by one.
  const seen = { lastSeenCampaignId: "c1", lastSeenActIndex: 1 };
  assert.equal(mayAppear(seen, "c1", 1), false, "not twice in the same chapter");
  assert.equal(mayAppear(seen, "c1", 2), true, "the next chapter is fair game");
  assert.equal(mayAppear(seen, "c2", 1), true, "and so is a different adventure");
});

test("the storyteller is told what they must not be, before what they are", () => {
  const note = rivalNote(bex);

  // The line the whole file exists to hold. "Nemesis" invites a small model to
  // reach for a monster, so the forbidding comes first and takes more room than
  // the character does — a 7B model reads the top of a block far more reliably
  // than the middle.
  const notDangerous = note.indexOf("NOT dangerous");
  const whatTheyAre = note.indexOf(bex.about);
  assert.ok(notDangerous > -1, "it says so");
  assert.ok(notDangerous < whatTheyAre, "and says so before anything else about them");

  // Wrapped across a line in the prompt, so the whitespace has to be loose.
  assert.match(note, /never threaten\s+anybody, never hurt anybody/);
  assert.match(note, /always safe in their company/);
  assert.match(note, /infuriating/);

  // Once a chapter, and permission to skip entirely.
  assert.match(note, /ONCE, if there is a natural place/);
  assert.match(note, /not at all if there is not/);
});

test("the score is told to the storyteller, because it is the story", () => {
  assert.match(rivalNote(bex), /never actually gone head to head/);
  assert.match(
    rivalNote({ ...bex, partyAhead: 3, rivalAhead: 1 }),
    /got there first 3 times, and Bex Underhill 1 time/,
  );
});

test("the scoreboard reads as a scoreboard", () => {
  assert.match(standings(0, 0, "Bex"), /yet to settle anything/);
  assert.match(standings(3, 1, "Bex"), /You are ahead of Bex, 3 to 1/);
  assert.match(standings(1, 3, "Bex"), /Bex is ahead of you, 3 to 1/);
  assert.match(standings(2, 2, "Bex"), /level, 2 apiece/);
});

test("only the three outcomes count", () => {
  for (const good of ["PARTY", "RIVAL", "NEITHER"]) assert.equal(isRivalOutcome(good), true, good);
  for (const bad of ["party", "WIN", "", null, undefined, 1]) {
    assert.equal(isRivalOutcome(bad), false, String(bad));
  }
});

test("most turns report no meeting at all", () => {
  // Every extraction written before rivals existed still parses, and reports
  // nothing rather than failing.
  const old = extractionSchema.parse({ memories: [] });
  assert.equal(old.rivalMet ?? null, null);

  const met = extractionSchema.parse({
    rivalMet: { note: "He was already there, holding it.", outcome: "RIVAL" },
  });
  assert.equal(met.rivalMet?.outcome, "RIVAL");
});

test("a meeting with no stated winner is a draw, not a win", () => {
  // Most crossings of paths settle nothing, and defaulting the other way would
  // inflate a scoreboard that is only worth reading because it is honest.
  const vague = extractionSchema.parse({ rivalMet: { note: "They passed on the road." } });
  assert.equal(vague.rivalMet?.outcome, "NEITHER");
});
