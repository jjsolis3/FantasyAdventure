import type { KnownPerson } from "@/lib/game/acquaintances";

/**
 * Who this party knows, for the family rather than for the storyteller.
 *
 * The storyteller has been told this since acquaintances were built — a block
 * in the context inviting it to bring one back if the chapter has room. The
 * family never has been. So a beekeeper the girls spent four evenings winning
 * over could walk back into chapter two of the next adventure and be met with
 * "who's that?", which is the exact opposite of the thing the feature exists to
 * do.
 *
 * It is a cast list and not a quest board: nothing here is outstanding and
 * nothing here is a lead. What it is for is the moment somebody turns up two
 * adventures later and a nine-year-old gets to say *I know him*.
 *
 * Told from the party's side rather than the world's — who knows them, and
 * where from — because that is the part a child owns. The world remembering you
 * is the reward for having been kind to it.
 */
export function KnownPeople({
  people,
  /** Compact enough to sit in a column beside the story. */
  compact = false,
}: {
  people: KnownPerson[];
  compact?: boolean;
}) {
  if (people.length === 0) return null;

  return (
    <ul className="space-y-2">
      {people.map((person) => (
        <li key={person.name} className="text-sm">
          <span className="text-hearth-100">{person.name}</span>
          {/* How often, but only once it has happened more than once. "Met in 1
              of your adventures" is a fact about nothing. */}
          {person.timesMet > 1 ? (
            <span className="ml-2 text-xs text-moss-400">
              turned up in {person.timesMet} of your adventures
            </span>
          ) : null}

          {compact ? null : <p className="text-hearth-200/70">{person.about}</p>}

          <p className="text-xs text-hearth-500">
            {person.knownBy.length > 0
              ? `${person.knownBy.join(" and ")} met them in ${person.metInCampaignTitle}`
              : `from ${person.metInCampaignTitle}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
