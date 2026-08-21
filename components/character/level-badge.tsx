import { MAX_LEVEL, levelProgress } from "@/lib/game/rules";

/**
 * A character's level, with a ring showing progress toward the next one.
 *
 * The ring matters more than it looks: a child who cannot yet see their
 * experience going anywhere has no reason to care that a roll earned any. This
 * makes "nearly there" visible at a glance.
 *
 * `level` is `Character.level` and is not optional, because the number on the
 * front of a child's sheet is the one thing here that must never be guessed.
 * See `levelProgress` for what happened when it was.
 */
export function LevelBadge({
  level: stored,
  xp,
  size = 64,
}: {
  level: number;
  xp: number;
  size?: number;
}) {
  const { level, into, needed } = levelProgress(xp, stored);

  // Geometry for the ring. strokeDasharray/offset draw an arc of the circle
  // proportional to progress, which needs no library and scales cleanly.
  const stroke = Math.max(3, Math.round(size / 16));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = needed === null ? 1 : Math.max(0, Math.min(1, into / needed));

  const atCap = needed === null;
  const label = atCap
    ? `Level ${level}, as far as it goes`
    : `Level ${level}, ${into} of ${needed} toward level ${level + 1}`;

  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1"
      title={label}
      aria-label={label}
      role="img"
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-hearth-800"
          />
          {fraction > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fraction)}
              className={atCap ? "stroke-moss-400" : "stroke-hearth-400"}
            />
          ) : null}
        </svg>

        <span
          className="absolute inset-0 flex items-center justify-center font-display text-hearth-100"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {level}
        </span>
      </div>

      <span className="text-[0.65rem] font-medium tracking-[0.18em] text-hearth-400 uppercase">
        {atCap ? "Max" : "Level"}
      </span>
    </div>
  );
}

/** Compact inline variant for tight rows, such as the play screen's party bar. */
export function LevelPip({ level: stored, xp }: { level: number; xp: number }) {
  const { level } = levelProgress(xp, stored);
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-hearth-600/60 bg-hearth-800/60 px-1.5 text-xs text-hearth-200"
      title={level >= MAX_LEVEL ? `Level ${level}, as far as it goes` : `Level ${level}`}
    >
      {level}
    </span>
  );
}
