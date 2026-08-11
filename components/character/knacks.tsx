import { chooseKnackAction } from "@/lib/game/growth-actions";
import { knackByKey, type Knack } from "@/lib/game/knacks";

/**
 * What reaching a level finally buys.
 *
 * Three offered, one taken. The three are drawn from what this character
 * actually did rather than from a list everybody sees, so the choice is about
 * her — and every one of them is worth having, so a seven-year-old cannot pick
 * badly here and find out four sessions later.
 *
 * Given its own card above everything else while there is one waiting, because
 * that is the reason she opened her page.
 */
export function KnackOffer({
  characterId,
  offered,
  unspent,
}: {
  characterId: string;
  offered: Knack[];
  unspent: number;
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-hearth-400">
        {unspent > 1
          ? `You have grown ${unspent} times over. Choose one, then come back for the next.`
          : "Choose one. They are all good, and this one is yours to keep."}
      </p>

      <ul className="space-y-2">
        {offered.map((knack) => (
          <li key={knack.key}>
            <form action={chooseKnackAction}>
              <input type="hidden" name="characterId" value={characterId} />
              <input type="hidden" name="key" value={knack.key} />
              <button
                type="submit"
                aria-label={`Take ${knack.name}`}
                className="w-full rounded-lg border border-hearth-800/60 p-3 text-left transition-colors hover:border-hearth-500 hover:bg-hearth-800/30"
              >
                <span className="block text-hearth-100">{knack.name}</span>
                <span className="block text-sm text-hearth-200/70">{knack.blurb}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What she has already grown into, in the order she grew into it. */
export function KnacksHeld({ held }: { held: { key: string; chosenAtLevel: number }[] }) {
  const known = held
    .map((row) => ({ knack: knackByKey(row.key), level: row.chosenAtLevel }))
    .filter((row): row is { knack: Knack; level: number } => row.knack !== undefined);

  if (known.length === 0) return null;

  return (
    <ul className="space-y-2">
      {known.map(({ knack, level }) => (
        <li key={knack.key} className="rounded-lg border border-hearth-800/50 p-3">
          <p className="text-sm text-hearth-100">
            {knack.name}
            <span className="ml-2 text-xs tracking-wide text-hearth-500 uppercase">
              since level {level}
            </span>
          </p>
          <p className="text-sm text-hearth-200/70">{knack.blurb}</p>
        </li>
      ))}
    </ul>
  );
}
