"use client";

import type { KnownFact } from "@/lib/game/briefing";

/**
 * The two things the table was never told.
 *
 * A passage would end, a question would land, and the girls would start
 * guessing — a door that was never mentioned, a person who was not there —
 * because by the end of a long paragraph the middle of it is gone. Meanwhile
 * every fact they had ever collected sat in the database, going into the
 * storyteller's prompt and onto nobody's screen.
 *
 * So: what is within reach right now, always visible, and what they have
 * learned so far, one tap away. Neither is a hint. Both are things they were
 * already told, put where a nine-year-old can find them again without holding
 * four scenes in her head.
 */

const KIND_WORDS: Record<string, string> = {
  FACT: "we found out",
  NPC: "someone",
  PLACE: "somewhere",
  PLOT_THREAD: "still hanging",
};

export function WhatsHere({
  onTheTable,
  known,
}: {
  /** Things this passage put within reach. Nouns, never advice. */
  onTheTable: string[];
  /** Everything worth remembering, most important first. */
  known: KnownFact[];
}) {
  if (onTheTable.length === 0 && known.length === 0) return null;

  return (
    <div className="mb-5 space-y-3">
      {onTheTable.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
            Right in front of you
          </h3>
          <ul className="flex flex-wrap gap-2">
            {onTheTable.map((thing) => (
              <li
                key={thing}
                className="rounded-full border border-hearth-700/70 bg-hearth-900/40 px-3 py-1 text-sm text-hearth-100"
              >
                {thing}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Folded away, on purpose. It is a reference, not the game — open when
          somebody says "wait, who was the woman with the keys?", shut the rest
          of the time so the passage keeps the screen. */}
      {known.length > 0 ? (
        <details className="rounded-lg border border-hearth-800/60 bg-hearth-950/30">
          <summary className="cursor-pointer px-3 py-2 text-sm text-hearth-300">
            What you know so far ({known.length})
          </summary>
          <ul className="space-y-1.5 px-3 pt-1 pb-3">
            {known.map((fact) => (
              <li key={fact.id} className="text-sm text-hearth-200">
                <span className="mr-2 text-xs text-hearth-500">
                  {KIND_WORDS[fact.kind] ?? "we found out"}
                </span>
                {fact.content}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
