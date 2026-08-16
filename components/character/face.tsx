import type { CharacterPicture } from "@/lib/game/character-picture";

/**
 * An adventurer's face, whichever rung of the ladder answered.
 *
 * One component for all three so no surface has to know the difference. Sized
 * by the caller, because the same face appears at 24 pixels next to an answer
 * and at 160 on her own sheet, and both should be the same face.
 *
 * The crest is drawn rather than fetched. Two colours and a letter is a handful
 * of SVG, which means the bottom rung of the ladder costs no bytes, no request
 * and no drawing service — and is therefore the rung that always works. A
 * household that never configures a drawing model still gets faces that change
 * when their girls change colour, which is the smallest possible way of saying
 * the choosing mattered.
 */
export function Face({
  picture,
  name,
  size = 40,
  className = "",
}: {
  picture: CharacterPicture;
  name: string;
  size?: number;
  className?: string;
}) {
  if (picture.source !== "CREST") {
    return (
      // A plain img: these are already square, already shrunk, and served from
      // this app, so next/image would add a loader and a layout pass for nothing.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture.url}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={name}
      className={`rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <circle cx="20" cy="20" r="20" fill={picture.wash} />
      {/* A ring rather than a flat disc: at 24 pixels beside a name it is the
          difference between a face and a smudge. */}
      <circle cx="20" cy="20" r="17.5" fill="none" stroke={picture.ink} strokeOpacity="0.45" />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fill={picture.ink}
        fontSize="18"
        fontWeight="600"
      >
        {picture.letter}
      </text>
    </svg>
  );
}
