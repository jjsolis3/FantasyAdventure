import type { ChapterCard as ChapterCardData } from "@/lib/game/recap";

/**
 * The card that marks a chapter turning.
 *
 * A chapter used to end silently, mid-scroll — the act index changed, the
 * header said "Chapter 2", and nothing said so. This is the moment an evening
 * naturally ends, and a family playing on a school night had nothing telling
 * them they had reached one.
 *
 * So: what you did, how the dice went, what you are carrying into the next one,
 * and — the part that is actually the point — permission to stop here.
 *
 * Stays up for the whole of the new chapter's first scene rather than for one
 * render. Nobody should lose it by refreshing, and the parent who was in the
 * kitchen should still get to read what happened.
 */
export function ChapterCard({ card }: { card: ChapterCardData }) {
  return (
    <section className="mb-8 rounded-xl border border-amber-800/40 bg-amber-950/15 p-5">
      <p className="text-xs tracking-[0.15em] text-amber-500/80 uppercase">
        Chapter {card.index} finished
      </p>
      <h2 className="font-display mt-1 text-2xl text-hearth-50">{card.title}</h2>

      {card.did.length > 0 ? (
        <>
          <h3 className="mt-4 mb-1.5 text-xs tracking-wide text-hearth-400 uppercase">
            What you did
          </h3>
          <ul className="space-y-1">
            {card.did.map((line) => (
              <li key={line} className="text-sm text-hearth-200">
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {card.rolls.thrown > 0 ? (
        <p className="mt-3 text-sm text-hearth-400">
          {card.rolls.landed} of {card.rolls.thrown} rolls landed.
          {/* Said plainly and without commiseration: a chapter where half the
              dice went badly is a better story, and a game that apologises for
              failed rolls teaches children not to try things. */}
          {card.rolls.landed * 2 < card.rolls.thrown
            ? " A hard chapter — the ones that go wrong are the better stories."
            : ""}
        </p>
      ) : null}

      {card.carrying.length > 0 ? (
        <>
          <h3 className="mt-4 mb-1.5 text-xs tracking-wide text-hearth-400 uppercase">
            What you carry on
          </h3>
          <ul className="space-y-1">
            {card.carrying.map((entry) => (
              <li key={entry.name} className="text-sm text-hearth-200/80">
                <span className="text-hearth-100">{entry.name}</span> — {entry.items.join(", ")}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-4 border-t border-amber-900/30 pt-3 text-sm text-hearth-300">
        {card.next ? (
          <>
            Next: <span className="text-hearth-100">{card.next.title}</span>. This is a good place
            to stop for tonight — everything is saved, and it will all still be here.
          </>
        ) : (
          <>That was the last chapter. Everything is saved.</>
        )}
      </p>
    </section>
  );
}
