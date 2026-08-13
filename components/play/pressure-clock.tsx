/**
 * The act's clock, in the story's own words.
 *
 * The teaching happens here rather than in any rule anybody reads out. A girl
 * spends a turn poking at something irrelevant, the fog moves one notch, and
 * next turn she has a real idea and it does not — and she has learned the whole
 * mechanic without a grown-up explaining a single thing.
 *
 * Which is exactly why it is never called "pressure" on screen. It is called
 * whatever the adventure calls it: *The fog*, *The stars going out*, *Days
 * until the festival*. A number teaches a rule; a name teaches a story.
 *
 * Absent until it starts moving. A party that is getting on with it never sees
 * a clock at all, and that silence is the reward.
 */

export function PressureClock({
  name,
  level,
  limit,
  className = "",
}: {
  name: string;
  level: number;
  limit: number;
  /** So the television can size it for a sofa. */
  className?: string;
}) {
  if (level <= 0) return null;

  const full = level >= limit;
  // The last notch reads differently from the middle ones. A child who can see
  // there is one left will spend the turn differently, which is the point.
  const nearly = !full && level >= limit - 1;

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        full
          ? "border-red-800/60 bg-red-950/30"
          : nearly
            ? "border-amber-700/50 bg-amber-950/20"
            : "border-hearth-800/60 bg-hearth-950/40"
      } ${className}`}
      role="status"
      aria-label={`${name}: ${level} of ${limit}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`text-sm font-medium ${
            full ? "text-red-300" : nearly ? "text-amber-300" : "text-hearth-300"
          }`}
        >
          {name}
        </span>

        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: limit }, (_, index) => (
            <span
              key={index}
              className={`h-2.5 w-2.5 rounded-full ${
                index < level
                  ? full
                    ? "bg-red-400"
                    : nearly
                      ? "bg-amber-400"
                      : "bg-hearth-400"
                  : "bg-hearth-800"
              }`}
            />
          ))}
        </span>
      </div>

      <p className="mt-1 text-xs text-hearth-500">
        {full
          ? "It has run out. Something is about to give."
          : nearly
            ? "One more wasted turn and it runs out."
            : "This moves when a turn goes nowhere. A good idea costs it nothing — and neither does a bad roll."}
      </p>
    </div>
  );
}
