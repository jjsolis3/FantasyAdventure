"use client";

/** A move that is unlocked and unspent for this scene. */
export type AvailableMove = {
  key: string;
  helperId: string;
  helperName: string;
  targetId: string;
  targetName: string;
  /**
   * What this pair calls this move, and what it does in their words.
   *
   * Resolved on the server from the relationship kind rather than looked up
   * here, because the flavour depends on who these two are to each other and
   * the picker only knows their names. Two sisters see *Shove Over*; a father
   * and a daughter see *Here, Let Me*; and the button, the storyteller and the
   * milestone all say the same thing because they all come from one place.
   */
  name: string;
  blurb: string;
};

export type MoveChoice = { key: string; helperId: string; targetId: string };

/**
 * Offered once, at the review step, rather than during each character's turn.
 *
 * A move belongs to a pair, not a person, so asking "does anyone want to help?"
 * after everyone has spoken is both simpler to explain and truer to what the
 * mechanic is for.
 */
export function FamilyMovePicker({
  available,
  chosen,
  onChoose,
}: {
  available: AvailableMove[];
  chosen: MoveChoice | null;
  onChoose: (choice: MoveChoice | null) => void;
}) {
  if (available.length === 0) return null;

  const same = (a: MoveChoice, b: AvailableMove) =>
    a.key === b.key && a.helperId === b.helperId && a.targetId === b.targetId;

  return (
    <div className="rounded-xl border border-moss-600/40 bg-moss-800/15 p-4">
      <h3 className="font-display mb-1 text-lg text-hearth-100">Family Moves</h3>
      <p className="mb-3 text-sm text-hearth-300/80">
        Something you can only do together. One per scene.
      </p>

      <div className="space-y-2">
        {available.map((option) => {
          const selected = chosen !== null && same(chosen, option);

          return (
            <button
              key={`${option.key}-${option.helperId}-${option.targetId}`}
              type="button"
              // Clicking the chosen one again clears it, so a move can be
              // un-picked without hunting for a cancel button.
              onClick={() =>
                onChoose(
                  selected
                    ? null
                    : { key: option.key, helperId: option.helperId, targetId: option.targetId },
                )
              }
              className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? "border-moss-400 bg-moss-800/40"
                  : "border-hearth-800/60 hover:border-moss-600/60"
              }`}
            >
              <span className="block text-hearth-100">
                {option.helperName} helps {option.targetName} — {option.name}
              </span>
              <span className="block text-sm text-hearth-300/80">{option.blurb}</span>
            </button>
          );
        })}
      </div>

      {chosen ? (
        <p className="mt-3 text-sm text-moss-400">
          Saved for this turn. It will be spent when you send.
        </p>
      ) : null}
    </div>
  );
}
