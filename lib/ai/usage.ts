/**
 * Adding up what the storyteller has used.
 *
 * Every call has been recorded since the pipeline was built — stage, model,
 * latency, tokens, repairs, and a slice of what went in and came back — and
 * until now nothing read any of it. That was fine while the model ran on a
 * computer in the house and cost nothing but electricity. It stopped being fine
 * the moment a table pointed this at a paid API.
 *
 * Prices are configured rather than assumed. Providers change them, and a rate
 * baked into this file would be a confident lie a month later; without them
 * this reports tokens and says so.
 */

export type Prices = {
  inputPer1M: number | null;
  outputPer1M: number | null;
  perImage: number | null;
  currency: string;
};

export type UsageRow = {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  failures: number;
  repairs: number;
  /** Null when tokens were never reported, which is normal for local models. */
  cost: number | null;
};

export type CallLike = {
  stage: string;
  model: string;
  ok: boolean;
  repairs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Present when the call belonged to an adventure; a practice turn does not. */
  campaignId?: string | null;
};

/**
 * Money for a number of tokens, or null when there is no price to apply.
 *
 * Null rather than zero throughout: an unpriced provider and a free one are
 * different facts, and a page that reports "$0.00" for a table that has spent
 * forty dollars is worse than one that admits it does not know.
 */
export function costOf(
  usage: { inputTokens: number; outputTokens: number },
  prices: Prices,
): number | null {
  if (prices.inputPer1M === null && prices.outputPer1M === null) return null;

  const input = ((prices.inputPer1M ?? 0) * usage.inputTokens) / 1_000_000;
  const output = ((prices.outputPer1M ?? 0) * usage.outputTokens) / 1_000_000;
  return input + output;
}

/** Groups calls by whatever `by` picks out of them — a stage, a model, a campaign. */
export function summarise(
  calls: CallLike[],
  by: (call: CallLike) => string,
  prices: Prices,
): UsageRow[] {
  const rows = new Map<string, UsageRow>();

  for (const call of calls) {
    const key = by(call);
    const row =
      rows.get(key) ??
      { key, calls: 0, inputTokens: 0, outputTokens: 0, failures: 0, repairs: 0, cost: null };

    row.calls += 1;
    row.inputTokens += call.inputTokens ?? 0;
    row.outputTokens += call.outputTokens ?? 0;
    row.repairs += call.repairs;
    if (!call.ok) row.failures += 1;

    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, cost: costOf(row, prices) }))
    .sort((a, b) => b.calls - a.calls);
}

/** Formats money the way a bill reads, or tokens when there is no price. */
export function formatCost(cost: number | null, currency: string): string {
  if (cost === null) return "—";

  // Fractions of a cent are the normal size of one turn, and rounding them to
  // two places would report most of this app's activity as zero.
  const places = cost > 0 && cost < 0.01 ? 4 : 2;
  return `${currency === "USD" ? "$" : `${currency} `}${cost.toFixed(places)}`;
}
