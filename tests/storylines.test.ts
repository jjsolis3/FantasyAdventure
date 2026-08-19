import { strict as assert } from "node:assert";
import { test } from "node:test";
import { storylines } from "../prisma/storylines.ts";
import { DEFAULT_PRESSURE_NAME } from "../lib/game/pressure.ts";
import { splitObjective } from "../lib/game/quests.ts";
import { whatWouldCount } from "../lib/game/finds.ts";

/**
 * Guards on the shipped adventures.
 *
 * These are checks on writing rather than on code, which is unusual, and worth
 * it for one reason: the quest, packing and keepsake loop is driven entirely by
 * `seeks`, and an act that forgets them fails silently. Nothing throws, nothing
 * looks broken — the chapter just opens a quest that says "see it through", the
 * packing screen has nothing to be read against, and the shelf stays empty for
 * an evening. That is exactly the kind of fault that survives a review and gets
 * found by a family on a Sunday.
 *
 * Five of the ten adventures shipped with no seeks at all, and the other five
 * had none in their final chapter. This is here so that cannot happen again.
 */

const acts = storylines.flatMap((story) =>
  story.acts.map((act) => ({ story: story.title, ...act })),
);

test("storylines: every chapter asks for something", () => {
  for (const act of acts) {
    const seeks = "seeks" in act && Array.isArray(act.seeks) ? (act.seeks as string[]) : [];
    assert.ok(
      seeks.length > 0,
      `${act.story}, chapter ${act.index} (${act.title}) has no seeks — its quest would open with nothing to find`,
    );
  }
});

test("storylines: the last chapter asks for something too", () => {
  // Called out separately because this is the one that was missed everywhere:
  // a finale is about doing rather than fetching, so it is the natural place to
  // leave `seeks` empty — and it is the chapter whose object becomes the
  // keepsake, so it is the worst place to leave it empty.
  for (const story of storylines) {
    const last = story.acts[story.acts.length - 1];
    const seeks = "seeks" in last && Array.isArray(last.seeks) ? (last.seeks as string[]) : [];
    assert.ok(seeks.length > 0, `${story.title} ends without anything to come away with`);
  }
});

test("storylines: sought things are things, not instructions", () => {
  for (const act of acts) {
    const seeks = "seeks" in act && Array.isArray(act.seeks) ? (act.seeks as string[]) : [];
    for (const sought of seeks) {
      assert.ok(sought.trim().length > 3, `${act.story}: "${sought}" is too short to recognise`);
      // Written to be pointed at, not performed. A seek starting with a verb is
      // a deed that has been filed in the wrong column, and it would show up on
      // the tracker as something to carry.
      assert.ok(
        !/^(find|get|bring|take|make|ask|tell|go|help)\b/i.test(sought.trim()),
        `${act.story}: "${sought}" reads as an instruction rather than a thing`,
      );
    }
  }
});

test("storylines: a chapter does not ask for the same thing twice", () => {
  for (const act of acts) {
    const seeks = "seeks" in act && Array.isArray(act.seeks) ? (act.seeks as string[]) : [];
    const unique = new Set(seeks.map((sought) => sought.toLowerCase().trim()));
    assert.equal(unique.size, seeks.length, `${act.story}, chapter ${act.index} repeats a seek`);
  }
});

test("storylines: no chapter is a shopping list", () => {
  // Each seek is an objective the party has to satisfy before the chapter's
  // quest closes. Three is plenty; more turns a chapter into an errand.
  for (const act of acts) {
    const seeks = "seeks" in act && Array.isArray(act.seeks) ? (act.seeks as string[]) : [];
    assert.ok(seeks.length <= 3, `${act.story}, chapter ${act.index} asks for ${seeks.length}`);
  }
});

test("storylines: every adventure names its own clock", () => {
  // The generic fallback exists so a half-written adventure works at all, and
  // it is exactly what a shipped one must never use. "The clock: 3 of 6" is a
  // rule a child reads; "The fog: 3 of 6" is a story she is inside of, and the
  // whole mechanic teaches itself through the difference.
  for (const story of storylines) {
    assert.ok(story.pressureName, `${story.title} has no clock`);
    assert.notEqual(
      story.pressureName,
      DEFAULT_PRESSURE_NAME,
      `${story.title} still uses the placeholder clock`,
    );
    assert.ok(
      story.pressureName.length <= 40,
      `${story.title}: "${story.pressureName}" is too long to sit beside a scene title`,
    );
  }
});

test("storylines: no two adventures share a clock", () => {
  // Not a correctness rule — a coincidence would work fine. It is here because
  // a duplicate almost always means one was pasted and never rewritten, and a
  // clock borrowed from another story will not match anything the table sees.
  const names = storylines.map((story) => story.pressureName.toLocaleLowerCase());
  assert.equal(new Set(names).size, names.length, JSON.stringify(names));
});

test("storylines: no sought thing is secretly two things", () => {
  // The mug. A family's personal aim read "craft the mug and successfully take
  // the first sip", which is two conditions in one circle — half finishable
  // with nothing on screen to say which half. `splitObjective` now takes those
  // apart, and a shipped seek that trips it would arrive as two objectives the
  // author never wrote.
  for (const act of acts) {
    const seeks = "seeks" in act && Array.isArray(act.seeks) ? (act.seeks as string[]) : [];
    for (const sought of seeks) {
      const parts = splitObjective(sought);
      assert.equal(
        parts.length,
        1,
        `${act.story}, chapter ${act.index}: "${sought}" comes apart into ${parts.length} — ${parts.join(" | ")}`,
      );
    }
  }
});

test("storylines: what would count reads like words a child would hunt for", () => {
  // Shown under every outstanding FIND now, so a seek made entirely of filler
  // would put "that, will, with" on a nine-year-old's screen under the heading
  // "anything with these in its name counts".
  for (const act of acts) {
    const seeks = "seeks" in act && Array.isArray(act.seeks) ? (act.seeks as string[]) : [];
    for (const sought of seeks) {
      const counts = whatWouldCount(sought);
      assert.ok(
        counts.length >= 2,
        `${act.story}: "${sought}" has almost nothing to match on — ${counts.join(", ")}`,
      );
    }
  }
});

test("storylines: every adventure is one the app can actually run", () => {
  const TONES = ["COZY", "ADVENTUROUS", "SPOOKY"];
  const LEVELS = ["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"];

  for (const story of storylines) {
    assert.ok(TONES.includes(story.defaultTone), `${story.title}: tone ${story.defaultTone}`);
    assert.ok(LEVELS.includes(story.readingLevel), `${story.title}: level ${story.readingLevel}`);
    assert.ok(story.minPlayers >= 1 && story.minPlayers <= story.maxPlayers, story.title);
    // Chapters numbered from one, in order. The act index is what the quest
    // board, the chapter card and the art ladder all key off.
    story.acts.forEach((act, at) => {
      assert.equal(act.index, at + 1, `${story.title}: chapter ${at + 1} is numbered ${act.index}`);
      assert.ok(act.beats.length > 0, `${story.title}, chapter ${act.index} has no beats`);
      assert.ok(act.goal.length > 20, `${story.title}, chapter ${act.index} has a thin goal`);
    });
  }
});

test("storylines: no two adventures share a slug or a title", () => {
  const slugs = storylines.map((story) => story.slug);
  const titles = storylines.map((story) => story.title.toLocaleLowerCase());
  assert.equal(new Set(slugs).size, slugs.length, "a duplicate slug would upsert over the other");
  assert.equal(new Set(titles).size, titles.length);
});
