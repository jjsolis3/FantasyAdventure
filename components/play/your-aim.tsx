"use client";

import type { YourAim as YourAimData } from "@/lib/game/briefing";

/**
 * The thing she is quietly after, where she can see it.
 *
 * ## Why this exists
 *
 * A personal aim is written at the top of a chapter, said once in a passage, and
 * then never shown again except behind a tab. A family played a whole evening
 * and reported afterwards that they could not finish theirs "even after finding
 * and even crafting my own" — and the mechanical half of that was real and has
 * been fixed. But underneath it was something simpler: nobody could see what
 * theirs actually asked for while they were deciding what to do.
 *
 * A goal one tap away, during a turn, is a goal that does not exist. That was
 * true of the shared objectives, which is why `WhatsHere` exists; it is more
 * true of a private one, because there is nobody else at the table to remember
 * it for you.
 *
 * ## Why it is not in `WhatsHere`
 *
 * Because that briefing also goes to the television. `neededObjectives` filters
 * personal quests out on purpose, and this comes down a separate, viewer-scoped
 * path that never reaches a screen in the middle of a living room. Two loaders
 * rather than one flag: a flag is one careless caller away from putting a
 * ten-year-old's secret on the wall.
 */
export function YourAims({
  aims,
  /** Show only this adventurer's, for the box she is typing into. */
  characterId,
}: {
  aims: YourAimData[];
  characterId?: string;
}) {
  const mine = characterId ? aims.filter((aim) => aim.characterId === characterId) : aims;
  if (mine.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      <h3 className="text-xs tracking-wide text-hearth-400 uppercase">
        {/* Named for the one thing that makes it different from every other
            goal on the screen. It is not a better quest or a bigger one — it is
            the one nobody else is keeping track of. */}
        {mine.length === 1 && !characterId ? "Just for you" : "Your own aim"}
      </h3>

      <ul className="space-y-3">
        {mine.map((aim) => (
          <li
            key={aim.questId}
            className="rounded-lg border border-hearth-600/40 bg-hearth-800/20 p-3"
          >
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-hearth-100">{aim.title}</span>
              {/* Whose, but only when more than one is on screen. On a shared
                  screen the parent is holding everybody's. */}
              {characterId ? null : (
                <span className="text-xs text-hearth-500">{aim.characterName}</span>
              )}
            </p>

            {aim.summary ? (
              <p className="mt-0.5 text-sm text-hearth-200/60">{aim.summary}</p>
            ) : null}

            <ul className="mt-2 space-y-1">
              {aim.objectives.map((objective) => (
                <li key={objective.id} className="flex gap-2 text-sm">
                  <span
                    className={objective.done ? "text-moss-400" : "text-hearth-600"}
                    aria-hidden
                  >
                    {objective.done ? "✓" : "○"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={objective.done ? "text-hearth-400" : "text-hearth-100"}>
                      {objective.text}
                    </span>

                    {/* The same forgiveness the shared board now advertises. An
                        aim read as a riddle with one exact answer is an aim
                        somebody hunts for the phrase of rather than the thing. */}
                    {objective.counts.length > 0 ? (
                      <span className="block text-xs text-hearth-500">
                        anything with {objective.counts.slice(0, 4).join(", ")} in its name counts
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            {/* Said plainly, exactly as it is for a shared objective. A girl who
                has been after one thing for sixteen turns already knows; the
                game pretending otherwise is what makes it feel like her fault. */}
            {aim.stuckFor !== null ? (
              <p className="mt-1.5 text-xs text-amber-500/90">
                you have been after this for {aim.stuckFor} turns — it is still out there
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-xs text-hearth-500">
        {/* Both halves matter. That it is private is the reward; that it is
            finished by playing rather than by declaring is the rule. */}
        Nobody else can see this. It finishes when it actually happens in the story — so say
        what you do about it, in a turn.
      </p>
    </div>
  );
}
