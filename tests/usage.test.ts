import { strict as assert } from "node:assert";
import { test } from "node:test";
import { costOf, formatCost, summarise, type CallLike, type Prices } from "../lib/ai/usage.ts";

const priced: Prices = { inputPer1M: 3, outputPer1M: 15, perImage: 0.01, currency: "USD" };
const unpriced: Prices = { inputPer1M: null, outputPer1M: null, perImage: null, currency: "USD" };

function call(over: Partial<CallLike> = {}): CallLike {
  return { stage: "narrate", model: "m", ok: true, repairs: 0, inputTokens: 0, outputTokens: 0, ...over };
}

test("usage: cost is input and output priced separately", () => {
  const cost = costOf({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, priced);
  assert.equal(cost, 18);
});

test("usage: without prices there is no cost, rather than a cost of zero", () => {
  // A table that has spent forty dollars must not be shown $0.00.
  assert.equal(costOf({ inputTokens: 500_000, outputTokens: 500_000 }, unpriced), null);
});

test("usage: one price on its own is enough to report something", () => {
  const cost = costOf(
    { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    { ...unpriced, inputPer1M: 3 },
  );
  assert.equal(cost, 3);
});

test("usage: calls are grouped, and failures and repairs counted", () => {
  const rows = summarise(
    [
      call({ stage: "narrate", inputTokens: 100, outputTokens: 50 }),
      call({ stage: "narrate", ok: false, repairs: 2 }),
      call({ stage: "extract", inputTokens: 10, outputTokens: 5 }),
    ],
    (entry) => entry.stage,
    priced,
  );

  const narrate = rows.find((row) => row.key === "narrate");
  assert.equal(narrate?.calls, 2);
  assert.equal(narrate?.failures, 1);
  assert.equal(narrate?.repairs, 2);
  assert.equal(narrate?.inputTokens, 100);
  assert.equal(rows.find((row) => row.key === "extract")?.calls, 1);
});

test("usage: the busiest stage is listed first", () => {
  const rows = summarise(
    [call({ stage: "a" }), call({ stage: "b" }), call({ stage: "b" })],
    (entry) => entry.stage,
    unpriced,
  );
  assert.equal(rows[0].key, "b");
});

test("usage: a local model reporting no tokens still counts its calls", () => {
  const rows = summarise([call({ inputTokens: null, outputTokens: null })], (c) => c.model, priced);

  assert.equal(rows[0].calls, 1);
  assert.equal(rows[0].inputTokens, 0);
});

test("usage: a turn costing a fraction of a penny is not rounded away", () => {
  assert.equal(formatCost(0.0004, "USD"), "$0.0004");
  assert.equal(formatCost(12.5, "USD"), "$12.50");
  assert.equal(formatCost(null, "USD"), "—");
});
