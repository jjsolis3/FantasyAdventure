import { LevelBadge } from "@/components/character/level-badge";
import { Face } from "@/components/character/face";
import type { CharacterPicture } from "@/lib/game/character-picture";
import { RELATIONSHIP_LABELS, STATS, STAT_INFO, type RelationshipKind, type StatKey } from "@/lib/game/rules";

export type PartySheet = {
  id: string;
  name: string;
  race: string;
  archetype: string;
  pronouns: string;
  description: string | null;
  xp: number;
  stats: Record<StatKey, number>;
  skills: { name: string; rank: number }[];
  inventory: { name: string; quantity: number; description: string | null }[];
  bonds: {
    otherId: string;
    otherName: string;
    kind: RelationshipKind;
    bondLevel: number;
    /**
     * How far into this level, and how far to the next.
     *
     * They earned bonds all evening and the number went up in silence: the
     * moves a bond unlocks were only ever visible inside a picker, mid-turn,
     * to whoever happened to be typing. A ladder nobody can see is a ladder
     * nobody climbs on purpose.
     */
    into: number;
    needed: number | null;
    /** What they can do together now. */
    moves: string[];
    /** What the next level would open, when there is one. */
    nextMove: { name: string; blurb: string } | null;
  }[];
  /** The household answering for this adventurer. */
  playedBy: string;
  yours: boolean;
  /** Set when a picture has been uploaded; changes when it is replaced. */
  portraitVersion: number | null;
  /**
   * Whichever rung of the portrait ladder answered.
   *
   * Never null: the bottom rung is a crest built from her own colours, so every
   * adventurer has a face on this list — which matters more here than anywhere,
   * because this is the list a child scans to find her sister's row.
   */
  picture: CharacterPicture;
  /** What she is wearing, from `lookSentence`. Empty until somebody dresses her. */
  look: string;
};

/**
 * Every adventurer's sheet, open to every player.
 *
 * On one screen this was a lean across the table. Apart, a child who cannot see
 * that their sister is the one with Might 5 has no way to suggest that she try
 * the door — so all of it is visible to everyone, and only your own is open to
 * begin with.
 *
 * Plain `<details>` on purpose: it needs no JavaScript, so it works on the phone
 * that is still loading and on the one that has given up loading.
 */
export function PartySheets({ sheets }: { sheets: PartySheet[] }) {
  if (sheets.length === 0) return null;

  return (
    <section className="mb-8 space-y-2">
      <h2 className="text-sm font-medium tracking-[0.15em] text-hearth-400 uppercase">The party</h2>

      {sheets.map((sheet) => (
        <details
          key={sheet.id}
          open={sheet.yours}
          className="rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-4"
        >
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
            <Face picture={sheet.picture} name={sheet.name} size={32} className="shrink-0" />
            <span className="text-hearth-100">{sheet.name}</span>
            <span className="text-sm text-hearth-400">
              {sheet.race} {sheet.archetype}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${
                sheet.yours
                  ? "border-moss-700/50 bg-moss-900/20 text-moss-400"
                  : "border-hearth-700/50 bg-hearth-800/40 text-hearth-300"
              }`}
            >
              {sheet.yours ? "yours" : sheet.playedBy}
            </span>
          </summary>

          <div className="mt-4 flex flex-wrap items-start gap-6">
            <LevelBadge xp={sheet.xp} size={56} />

            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {STATS.map((stat) => (
                <div key={stat}>
                  <dt className="text-xs tracking-wide text-hearth-400 uppercase">
                    {STAT_INFO[stat].label}
                  </dt>
                  <dd className="font-display text-xl text-hearth-100">{sheet.stats[stat]}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* What she looks like, then what she is like. Same order as the
              dressing room and the same order as the prompt, so a child reading
              her sister's sheet meets her the way the story does. */}
          {sheet.look ? <p className="mt-4 text-sm text-hearth-200/80">{sheet.look}</p> : null}

          {sheet.description ? (
            <p className="mt-1 text-sm leading-relaxed text-hearth-200/70 italic">
              {sheet.description}
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs tracking-wide text-hearth-400 uppercase">Good at</h3>
              {sheet.skills.length === 0 ? (
                <p className="text-sm text-hearth-500">Nothing written down yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {sheet.skills.map((skill) => (
                    <li key={skill.name} className="text-sm text-hearth-200/80">
                      {skill.name}
                      <span className="text-hearth-400"> · rank {skill.rank}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-1 text-xs tracking-wide text-hearth-400 uppercase">Carrying</h3>
              {sheet.inventory.length === 0 ? (
                <p className="text-sm text-hearth-500">Empty pockets.</p>
              ) : (
                <ul className="space-y-0.5">
                  {sheet.inventory.map((item) => (
                    <li key={item.name} className="text-sm text-hearth-200/80" title={item.description ?? ""}>
                      {item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {sheet.bonds.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-1 text-xs tracking-wide text-hearth-400 uppercase">Bonds</h3>
              <ul className="space-y-0.5">
                {sheet.bonds.map((bond) => (
                  <li key={bond.otherId} className="text-sm text-hearth-200/80">
                    {RELATIONSHIP_LABELS[bond.kind]} {bond.otherName}
                    <span className="text-hearth-400"> · bond {bond.bondLevel}</span>

                    {bond.moves.length > 0 ? (
                      <span className="block text-xs text-moss-400">
                        together: {bond.moves.join(", ")}
                      </span>
                    ) : null}

                    {/* The next rung, named. "Two more" means nothing on its
                        own; "two more and you can Stand Together" is a reason
                        to go and be kind to your sister. */}
                    {bond.nextMove && bond.needed !== null ? (
                      <span className="block text-xs text-hearth-500">
                        {bond.needed - bond.into} more{" "}
                        {bond.needed - bond.into === 1 ? "moment" : "moments"} together unlocks{" "}
                        {bond.nextMove.name} — {bond.nextMove.blurb}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </details>
      ))}
    </section>
  );
}
