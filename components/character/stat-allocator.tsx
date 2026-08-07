"use client";

import { STATS, STAT_BUDGET, STAT_INFO, STAT_MAX, STAT_MIN, type StatBlock, type StatKey } from "@/lib/game/rules";

export function StatAllocator({
  stats,
  onChange,
  affinity,
}: {
  stats: StatBlock;
  onChange: (stats: StatBlock) => void;
  /** Highlighted as a suggestion from race or calling. Never enforced. */
  affinity?: StatKey | null;
}) {
  const spent = STATS.reduce((sum, stat) => sum + stats[stat], 0);
  const remaining = STAT_BUDGET - spent;

  function adjust(stat: StatKey, delta: number) {
    const next = stats[stat] + delta;
    if (next < STAT_MIN || next > STAT_MAX) return;
    if (delta > 0 && remaining <= 0) return;
    onChange({ ...stats, [stat]: next });
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-sm font-medium text-hearth-200">Spread the points</span>
        <span
          className={`text-sm font-medium ${remaining === 0 ? "text-moss-400" : "text-hearth-300"}`}
          aria-live="polite"
        >
          {remaining === 0 ? "All points spent" : `${remaining} point${remaining === 1 ? "" : "s"} left`}
        </span>
      </div>

      <div className="space-y-3">
        {STATS.map((stat) => {
          const value = stats[stat];
          const isAffinity = affinity === stat;

          return (
            <div
              key={stat}
              className={`rounded-lg border p-3 ${
                isAffinity ? "border-moss-600/50 bg-moss-800/20" : "border-hearth-800/60 bg-hearth-950/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-hearth-100">{STAT_INFO[stat].label}</span>
                    {isAffinity ? (
                      <span className="rounded-full border border-moss-600/50 px-2 py-0.5 text-xs text-moss-400">
                        suits you
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-hearth-400">{STAT_INFO[stat].blurb}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(stat, -1)}
                    disabled={value <= STAT_MIN}
                    aria-label={`Lower ${STAT_INFO[stat].label}`}
                    className="h-8 w-8 rounded-md border border-hearth-700 text-lg leading-none text-hearth-200 disabled:opacity-30"
                  >
                    −
                  </button>

                  <div className="flex w-24 justify-center gap-1" aria-hidden>
                    {Array.from({ length: STAT_MAX }, (_, index) => (
                      <span
                        key={index}
                        className={`h-3 w-3 rounded-full ${
                          index < value ? "bg-hearth-400" : "bg-hearth-800"
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => adjust(stat, 1)}
                    disabled={value >= STAT_MAX || remaining <= 0}
                    aria-label={`Raise ${STAT_INFO[stat].label}`}
                    className="h-8 w-8 rounded-md border border-hearth-700 text-lg leading-none text-hearth-200 disabled:opacity-30"
                  >
                    +
                  </button>

                  <span className="w-4 text-right text-sm text-hearth-300">{value}</span>
                </div>
              </div>

              {/* The server reads these, not the buttons. */}
              <input type="hidden" name={stat} value={value} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
