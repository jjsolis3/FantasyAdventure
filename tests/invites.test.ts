import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rankCandidates } from "../lib/game/invites.ts";

const mine = [{ id: "mine-1", name: "Bramble" }];

function other(id: string, name: string) {
  return { id, name, race: "Fox-folk", archetype: "Trickster", playedBy: "Ada" };
}

test("invites: everybody else's adventurers are offered, tied or not", () => {
  // The bug this feature exists to fix: a child makes their first character,
  // has no relationships yet, and is invisible to everyone trying to start an
  // adventure with them.
  const rows = rankCandidates(mine, [other("a", "Wren")], []);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].tie, null);
});

test("invites: family comes first", () => {
  const rows = rankCandidates(
    mine,
    [other("stranger", "Aspen"), other("kin", "Fen")],
    [{ characterAId: "kin", characterBId: "mine-1", aToB: "SIBLING", bondLevel: 0 }],
  );

  assert.deepEqual(
    rows.map((row) => row.name),
    ["Fen", "Aspen"],
  );
  assert.equal(rows[0].tie, "sibling of Bramble");
});

test("invites: the tie is described from your side of it", () => {
  // Stored as "mine-1 is the PARENT of child", so the child is offered as the
  // child of yours — not as your parent.
  const rows = rankCandidates(
    mine,
    [other("child", "Fen")],
    [{ characterAId: "mine-1", characterBId: "child", aToB: "PARENT", bondLevel: 2 }],
  );

  assert.equal(rows[0].tie, "child of Bramble");
});

test("invites: the strongest bond wins when two of yours know the same person", () => {
  const rows = rankCandidates(
    [
      { id: "mine-1", name: "Bramble" },
      { id: "mine-2", name: "Thistle" },
    ],
    [other("kin", "Fen")],
    [
      { characterAId: "kin", characterBId: "mine-1", aToB: "FRIEND", bondLevel: 1 },
      { characterAId: "kin", characterBId: "mine-2", aToB: "SIBLING", bondLevel: 4 },
    ],
  );

  assert.equal(rows[0].tie, "sibling of Thistle");
  assert.equal(rows[0].bondLevel, 4);
});

test("invites: ties among your own adventurers say nothing about who to ask", () => {
  const rows = rankCandidates(
    [
      { id: "mine-1", name: "Bramble" },
      { id: "mine-2", name: "Thistle" },
    ],
    [other("kin", "Fen")],
    [{ characterAId: "mine-1", characterBId: "mine-2", aToB: "SIBLING", bondLevel: 5 }],
  );

  assert.equal(rows[0].tie, null);
});

test("invites: closer bonds are offered before distant ones", () => {
  const rows = rankCandidates(
    mine,
    [other("far", "Aspen"), other("near", "Fen")],
    [
      { characterAId: "far", characterBId: "mine-1", aToB: "FRIEND", bondLevel: 1 },
      { characterAId: "near", characterBId: "mine-1", aToB: "SIBLING", bondLevel: 3 },
    ],
  );

  assert.deepEqual(
    rows.map((row) => row.name),
    ["Fen", "Aspen"],
  );
});
