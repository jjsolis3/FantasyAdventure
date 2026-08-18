import { raiseStatAction } from "@/lib/game/growth-actions";
import {
  STATS,
  STAT_CEILING,
  STAT_INFO,
  LUCK_NUDGE_NOTE,
  luckOdds,
  statModifier,
  XP_PER_STAT_POINT,
  nextPointAt,
  statPointsUnspent,
  type StatBlock,
} from "@/lib/game/rules";

/**
 * The sheet filling up.
 *
 * A row of spheres per stat, one lighting up for every point — which is the
 * whole reason this exists. Experience used to tick upward and change nothing
 * anybody could see; the number went up, the character did not. Twelve spheres
 * a row, filling over a long career, is what "she is getting better" looks like
 * from across a kitchen table.
 *
 * The modifier is printed beside each one because the spheres alone would hide
 * the curve: the eleventh sphere is worth less than the second, and a child
 * deciding where to put a point deserves to see that rather than discover it.
 */
export function Growth({
  characterId,
  stats,
  xp,
  builtWith,
  yours,
}: {
  characterId: string;
  stats: StatBlock;
  xp: number;
  /**
   * The budget she was actually built with.
   *
   * It was not passed at all, so this defaulted to today's constant — which is
   * precisely the mistake `Character.buildBudget` exists to prevent, made on the
   * one screen where a child reads the number. An adventurer built when the
   * budget was 21 was being told she had spent two points she never spent.
   */
  builtWith: number;
  yours: boolean;
}) {
  const unspent = statPointsUnspent(stats, xp, builtWith);
  const next = nextPointAt(stats, xp, builtWith);

  return (
    <div>
      <p className="mb-4 text-sm text-hearth-400">
        {unspent > 0 ? (
          <span className="text-hearth-200">
            {unspent} {unspent === 1 ? "point" : "points"} to spend.
          </span>
        ) : (
          <>
            One more point every {XP_PER_STAT_POINT} experience. Spend them wherever you like — they
            never come back out.
            {/* When, specifically. Points are rare now by design, and a sheet
                that says "0 to spend" for three evenings with no explanation
                reads as the game having forgotten her. */}
            {next !== null ? (
              <span className="mt-1 block text-hearth-300">
                {xp} so far — the next one lands at {next}.
              </span>
            ) : null}
          </>
        )}
      </p>

      <ul className="space-y-3">
        {STATS.map((stat) => {
          const value = stats[stat];
          const modifier = statModifier(value);
          const full = value >= STAT_CEILING;

          return (
            <li key={stat}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="w-14 shrink-0 text-sm text-hearth-100">
                  {STAT_INFO[stat].label}
                </span>

                {/* Twelve spheres, so the room left is as visible as the
                    progress made. Decorative — the numbers beside them carry
                    the meaning for anybody not looking at colours. */}
                <span className="flex gap-0.5" aria-hidden>
                  {Array.from({ length: STAT_CEILING }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2 w-2 rounded-full ${
                        index < value ? "bg-hearth-400" : "bg-hearth-800"
                      }`}
                    />
                  ))}
                </span>

                <span className="text-sm text-hearth-400 tabular-nums">
                  {value} · {modifier >= 0 ? `+${modifier}` : modifier} to rolls
                  {/* Luck alone carries a second number, because it alone does
                      something on every check rather than on its own. Printed
                      next to the modifier for the same reason the modifier is
                      printed at all: a point is about to be spent here, and
                      what it buys should be readable before it is spent. */}
                  {stat === "luck" ? ` · ${luckOdds(value)}` : ""}
                </span>

                {yours && unspent > 0 && !full ? (
                  <form action={raiseStatAction} className="ml-auto">
                    <input type="hidden" name="characterId" value={characterId} />
                    <input type="hidden" name="stat" value={stat} />
                    <button
                      type="submit"
                      aria-label={`Put a point into ${STAT_INFO[stat].label}`}
                      className="rounded-lg border border-hearth-600 px-3 py-1 text-sm text-hearth-200 transition-colors hover:bg-hearth-700/40"
                    >
                      Raise
                    </button>
                  </form>
                ) : null}
              </div>
              <p className="mt-0.5 pl-[4.25rem] text-sm text-hearth-200/50">
                {STAT_INFO[stat].blurb}
                {stat === "luck" ? ` ${LUCK_NUDGE_NOTE}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
