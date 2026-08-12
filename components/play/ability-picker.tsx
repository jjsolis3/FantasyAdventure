"use client";

/**
 * The one thing this girl can do, offered where she is already typing.
 *
 * Not at the review step, which is where Family Moves live. A move belongs to a
 * pair, so somebody has to choose it on behalf of both and after everyone has
 * spoken is the honest moment. A signature belongs to one person: she should
 * decide while she is deciding what to do, and on her own phone nobody else
 * should be deciding it for her.
 *
 * Spent ones stay on the list, greyed, rather than disappearing. "Already used
 * this scene" is information; a button that quietly vanishes reads as a bug,
 * and a seven-year-old will assume she broke it.
 */

export type AvailableAbility = {
  key: string;
  name: string;
  blurb: string;
  /** "Once a scene" or "Once a chapter", already worded for a player. */
  scopeLabel: string;
  spent: boolean;
};

export function AbilityPicker({
  abilities,
  chosen,
  onChoose,
  disabled = false,
}: {
  abilities: AvailableAbility[];
  chosen: string | null;
  onChoose: (key: string | null) => void;
  disabled?: boolean;
}) {
  if (abilities.length === 0) return null;

  const anyLeft = abilities.some((ability) => !ability.spent);

  return (
    <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="font-display text-base text-hearth-100">Something only you can do</h4>
        {chosen ? (
          <button
            type="button"
            onClick={() => onChoose(null)}
            disabled={disabled}
            className="text-xs text-hearth-400 underline underline-offset-4 hover:text-hearth-200 disabled:opacity-50"
          >
            Save it
          </button>
        ) : null}
      </div>

      {!anyLeft ? (
        <p className="text-sm text-hearth-500">
          You have used everything you get for now. It comes back next scene.
        </p>
      ) : null}

      <div className="space-y-2">
        {abilities.map((ability) => {
          const selected = chosen === ability.key;

          return (
            <button
              key={ability.key}
              type="button"
              // Tapping the chosen one again puts it away, so it can be
              // un-picked without hunting for a cancel.
              onClick={() => onChoose(selected ? null : ability.key)}
              disabled={disabled || ability.spent}
              aria-pressed={selected}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                ability.spent
                  ? "cursor-not-allowed border-hearth-800 bg-hearth-950/50 opacity-60"
                  : selected
                    ? "border-moss-400 bg-moss-700/25"
                    : "border-hearth-700 hover:border-hearth-600"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-hearth-100">{ability.name}</span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-hearth-500">
                  {ability.spent ? "used" : ability.scopeLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-hearth-300/80">{ability.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
