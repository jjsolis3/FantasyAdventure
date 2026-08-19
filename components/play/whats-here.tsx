"use client";

import type { KnownFact, NeededObjective } from "@/lib/game/briefing";

/**
 * The three things the table was never told.
 *
 * A passage would end, a question would land, and the girls would start
 * guessing — a door that was never mentioned, a person who was not there —
 * because by the end of a long paragraph the middle of it is gone. Meanwhile
 * every fact they had ever collected sat in the database, going into the
 * storyteller's prompt and onto nobody's screen.
 *
 * So: what is within reach right now, always visible; what the board is still
 * asking for, also always visible; and what they have learned so far, one tap
 * away. None of it is a hint. All of it is things they were already told, put
 * where a nine-year-old can find them again without holding four scenes in her
 * head.
 *
 * The middle one is the newest and the one a whole evening was lost to. A
 * family invented their own goal — "find the faceless demon creature" — and
 * chased it for an hour while the real objectives, "the old family album" and
 * "a camera that still takes film", sat behind a quest tab nobody opened
 * mid-turn. A goal one tap away, during a turn, is a goal that does not exist.
 */

/**
 * What an objective is asking of them, in two words.
 *
 * FIND resolves itself by looking in the party's pockets, so "find" is honest:
 * carrying it is the whole job. DEED needs the storyteller to say it happened,
 * so "do" — there is no shortcut through an inventory.
 */
const NEED_WORDS: Record<string, string> = { FIND: "find", DEED: "do" };

const KIND_WORDS: Record<string, string> = {
  FACT: "we found out",
  NPC: "someone",
  PLACE: "somewhere",
  PLOT_THREAD: "still hanging",
};

export function WhatsHere({
  onTheTable,
  needed,
  leads,
  tried,
  known,
}: {
  /** Things this passage put within reach. Nouns, never advice. */
  onTheTable: string[];
  /** What the shared quests are still waiting on. */
  needed: NeededObjective[];
  /** Somewhere worth going next, gathered across the scene. */
  leads: string[];
  /** What anybody has already had a go at this scene. */
  tried: string[];
  /** Everything worth remembering, most important first. */
  known: KnownFact[];
}) {
  if (
    onTheTable.length === 0 &&
    needed.length === 0 &&
    leads.length === 0 &&
    known.length === 0 &&
    tried.length === 0
  ) {
    return null;
  }

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

      {/* Not folded, unlike what-you-know below. This is the answer to "what
          are we even doing", and a girl who has to open something to find that
          out will invent an answer instead. */}
      {needed.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
            What you still need
          </h3>
          <ul className="space-y-2">
            {needed.map((objective, index) => (
              <li key={objective.id}>
                {/* The quest name once per run rather than on every line. Five
                    objectives each trailing the same three words is a wall, and
                    the girls stop reading walls. */}
                {index === 0 || needed[index - 1].quest !== objective.quest ? (
                  <p className="text-xs text-hearth-500">{objective.quest}</p>
                ) : null}
                <p className="flex gap-2 text-sm text-hearth-100">
                  <span className="text-xs text-hearth-500 uppercase">
                    {NEED_WORDS[objective.kind] ?? "do"}
                  </span>
                  <span>{objective.text}</span>
                </p>

                {/* What the game would actually accept. The matcher has always
                    been forgiving and the screen has always shown the exact
                    words, so a family read every objective as a riddle with one
                    answer and hunted for the phrase rather than the thing. */}
                {objective.counts.length > 0 ? (
                  <p className="mt-0.5 ml-9 text-xs text-hearth-500">
                    anything with {objective.counts.slice(0, 4).join(", ")} in its name counts
                  </p>
                ) : null}

                {/* Said plainly. A family who has been in one room for sixteen
                    turns already knows; the game pretending otherwise is what
                    makes it feel like their fault. */}
                {objective.stuckFor !== null ? (
                  <p className="mt-0.5 ml-9 text-xs text-amber-500/90">
                    you have been after this for {objective.stuckFor} turns
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Under what they need, because that is the order the question comes in:
          what are we after, and where might it be. Never the answer — a lead is
          the next door, and what is behind it is still a turn somebody takes. */}
      {leads.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
            Somewhere to try
          </h3>
          <ul className="space-y-1">
            {leads.map((lead) => (
              <li key={lead} className="text-sm text-hearth-200/90">
                {lead}
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

      {/* Also folded, and for the same reason — it is a checklist rather than
          part of the story. Opened when somebody says "did we try the barn?",
          which is a question that costs a table four passages of scrolling to
          answer and one tap to answer here. */}
      {tried.length > 0 ? (
        <details className="rounded-lg border border-hearth-800/60 bg-hearth-950/30">
          <summary className="cursor-pointer px-3 py-2 text-sm text-hearth-300">
            What you have already tried ({tried.length})
          </summary>
          <ul className="space-y-1.5 px-3 pt-1 pb-3">
            {tried.map((attempt) => (
              <li key={attempt} className="text-sm text-hearth-200/70">
                {attempt}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
