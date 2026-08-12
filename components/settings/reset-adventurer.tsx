"use client";

import { useActionState, useState } from "react";
import { resetCharacterAction, type ResetFormState } from "@/lib/game/reset-actions";
import { STATS, STAT_BUDGET, STAT_INFO, STAT_MAX, STAT_MIN, type StatBlock } from "@/lib/game/rules";

/**
 * The form that starts an adventurer again.
 *
 * Written to be read before it is used, which is unusual for a form and right
 * for this one. What it undoes took evenings to earn, so the page leads with a
 * plain list of what will go and what will stay, and only then asks.
 *
 * The four numbers are here rather than derived because they cannot be derived.
 * Stats are built once and afterwards only rise, so the game knows exactly how
 * many points growth added and has no record of which stats they went into. A
 * guess would be unfixable — nothing in the game can edit stats after the
 * builder — so somebody who remembers her gets to say.
 */
export function ResetAdventurer({
  characterId,
  name,
  suggested,
  current,
}: {
  characterId: string;
  name: string;
  suggested: StatBlock;
  current: StatBlock;
}) {
  const [state, action, pending] = useActionState<ResetFormState, FormData>(
    resetCharacterAction,
    {},
  );
  const [build, setBuild] = useState<StatBlock>(suggested);

  const spent = STATS.reduce((sum, stat) => sum + build[stat], 0);
  const left = STAT_BUDGET - spent;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="characterId" value={characterId} />

      <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-4">
        <h3 className="font-display mb-3 text-lg text-hearth-100">Her four numbers</h3>
        <p className="mb-4 text-sm text-hearth-300/80">
          These are set when an adventurer is built and only ever go up afterwards, so the game
          knows how many points {name} earned but not which numbers they went into. Below is a
          best guess — if you remember how she was built, put it right. Twelve points, none
          below {STAT_MIN} or above {STAT_MAX}.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((stat) => (
            <label key={stat} className="block">
              <span className="block text-sm text-hearth-300">{STAT_INFO[stat].label}</span>
              <input
                type="number"
                name={stat}
                value={build[stat]}
                min={STAT_MIN}
                max={STAT_MAX}
                onChange={(event) =>
                  setBuild((current) => ({ ...current, [stat]: Number(event.target.value) }))
                }
                className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100"
              />
              <span className="mt-1 block text-xs text-hearth-500">now {current[stat]}</span>
            </label>
          ))}
        </div>

        <p
          className={`mt-3 text-sm ${
            left === 0 ? "text-moss-400" : "text-amber-300"
          }`}
        >
          {left === 0
            ? "Twelve points, exactly right."
            : left > 0
              ? `${left} point${left === 1 ? "" : "s"} still to spend.`
              : `${-left} point${left === -1 ? "" : "s"} too many.`}
        </p>
      </div>

      <div>
        <label htmlFor="confirmName" className="block text-sm text-hearth-300">
          Type <span className="text-hearth-100">{name}</span> to confirm
        </label>
        <input
          id="confirmName"
          name="confirmName"
          autoComplete="off"
          placeholder={name}
          className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-4 py-2.5 text-hearth-100 placeholder:text-hearth-700"
        />
        <p className="mt-1.5 text-sm text-hearth-500">
          Typing the name is the one confirmation that cannot be clicked through by mistake — and
          it makes resetting the wrong adventurer of two very hard to do.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-lg border border-rose-800/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || left !== 0}
        className="rounded-lg border border-rose-700/60 bg-rose-900/30 px-5 py-2.5 font-medium text-rose-100 hover:bg-rose-900/50 disabled:opacity-40"
      >
        {pending ? "Starting her again…" : `Start ${name} again`}
      </button>
    </form>
  );
}
