import { chooseSkillAction } from "@/lib/game/growth-actions";

/**
 * The skill a level hands over.
 *
 * Three suggestions, then the whole list behind a disclosure. The order matters
 * and is the whole design of this component: the suggestions come first because
 * "you keep doing this" is the nicest sentence the game can say to a child, and
 * the full list is one tap away because a girl who has decided her adventurer
 * talks to animals should not have to wait for the game to guess.
 *
 * The disclosure is a plain `<details>`. It works before hydration, it works
 * with a keyboard, and it costs nothing — which matters on a page a nine-year-old
 * opens on a phone that has been dropped a few times.
 */

export type Suggestion = { skill: string; reason: string };

export function SkillOffer({
  characterId,
  suggestions,
  browsable,
  unspent,
}: {
  characterId: string;
  suggestions: Suggestion[];
  browsable: { label: string; skills: string[] }[];
  unspent: number;
}) {
  const total = browsable.reduce((sum, group) => sum + group.skills.length, 0);

  return (
    <div>
      <p className="mb-4 text-sm text-hearth-400">
        {unspent > 1
          ? `You have levelled up ${unspent} times without picking. Choose one, then come back for the next.`
          : "Pick something new to be good at. This one is yours to keep."}
      </p>

      <ul className="space-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.skill}>
            <form action={chooseSkillAction}>
              <input type="hidden" name="characterId" value={characterId} />
              <input type="hidden" name="skill" value={suggestion.skill} />
              <button
                type="submit"
                aria-label={`Learn ${suggestion.skill}`}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-hearth-800/60 p-3 text-left transition-colors hover:border-hearth-500 hover:bg-hearth-800/30"
              >
                <span className="text-hearth-100">{suggestion.skill}</span>
                {suggestion.reason ? (
                  <span className="shrink-0 text-xs text-hearth-500">{suggestion.reason}</span>
                ) : null}
              </button>
            </form>
          </li>
        ))}
      </ul>

      {total > 0 ? (
        <details className="mt-4 rounded-lg border border-hearth-800/60">
          <summary className="cursor-pointer px-3 py-2 text-sm text-hearth-300 hover:text-hearth-100">
            Show me everything ({total})
          </summary>

          <div className="space-y-4 px-3 pt-1 pb-3">
            {browsable.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-hearth-500">
                  {group.label}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {group.skills.map((skill) => (
                    <li key={skill}>
                      <form action={chooseSkillAction}>
                        <input type="hidden" name="characterId" value={characterId} />
                        <input type="hidden" name="skill" value={skill} />
                        <button
                          type="submit"
                          aria-label={`Learn ${skill}`}
                          className="rounded-full border border-hearth-800 px-3 py-1.5 text-sm text-hearth-200 transition-colors hover:border-hearth-500 hover:bg-hearth-800/30"
                        >
                          {skill}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
