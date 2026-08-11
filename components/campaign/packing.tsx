import { bringSupplyAction, leaveSupplyAction } from "@/lib/game/loadout-actions";
import { SUPPLIES_PER_CHARACTER, suppliesFor } from "@/lib/game/loadout";

export type Packer = {
  characterId: string;
  name: string;
  archetype: string;
  /** The story's mood, which suggests a couple of things of its own. */
  tone: string;
  /** Names of supplies already in the pack, for this adventure. */
  packed: string[];
  /** False for somebody else's adventurer, whose pack is shown but not touched. */
  yours: boolean;
};

/**
 * "What are you bringing?"
 *
 * The moment before setting out. Every child who has played anything on a
 * screen knows it, and until now an adventure simply started with everybody's
 * pockets empty.
 *
 * Shown as a row of things to take rather than a shop, because there is no
 * wrong answer here and nothing is scarce. Two each, so that it is a real
 * decision — taking the mirror means not taking the bell — and changeable right
 * up until the story begins.
 */
export function Packing({ campaignId, packers }: { campaignId: string; packers: Packer[] }) {
  return (
    <div className="space-y-6">
      {packers.map((packer) => {
        const offered = suppliesFor(packer.archetype, packer.tone);
        const room = SUPPLIES_PER_CHARACTER - packer.packed.length;

        return (
          <div key={packer.characterId}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="font-display text-lg text-hearth-100">{packer.name}</h3>
              <p className="text-sm text-hearth-400">
                {room > 0
                  ? `${room} more to choose`
                  : `packed — ${packer.packed.length} of ${SUPPLIES_PER_CHARACTER}`}
              </p>
            </div>

            {!packer.yours ? (
              <p className="mb-2 text-sm text-hearth-400 italic">
                {packer.packed.length > 0
                  ? `Bringing ${packer.packed.join(" and ")}.`
                  : "Has not packed yet."}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {offered.map((supply) => {
                  const taken = packer.packed.includes(supply.name);
                  const full = room <= 0;

                  return (
                    <li key={supply.name}>
                      <form action={taken ? leaveSupplyAction : bringSupplyAction}>
                        <input type="hidden" name="campaignId" value={campaignId} />
                        <input type="hidden" name="characterId" value={packer.characterId} />
                        <input type="hidden" name="name" value={supply.name} />
                        <button
                          type="submit"
                          // A full pack greys out what was not chosen rather
                          // than hiding it, so the choice stays visible and can
                          // be reconsidered by putting something back.
                          disabled={!taken && full}
                          aria-pressed={taken}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                            taken
                              ? "border-hearth-500 bg-hearth-600/20 hover:bg-hearth-600/30"
                              : full
                                ? "cursor-not-allowed border-hearth-800/40 opacity-40"
                                : "border-hearth-800/60 hover:border-hearth-600 hover:bg-hearth-800/30"
                          }`}
                        >
                          <span className="block text-sm text-hearth-100">
                            {taken ? "✓ " : ""}
                            {supply.name}
                          </span>
                          <span className="block text-sm text-hearth-200/60">
                            {supply.description}
                          </span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
