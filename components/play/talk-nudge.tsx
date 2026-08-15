/**
 * The game leaning over and saying "you could just talk about it".
 *
 * Sits directly above the two round buttons, so the sentence and the button it
 * is about are one thing to look at. Quiet on purpose — the same weight as the
 * clock rather than the weight of an alert, because it is a suggestion a table
 * is entirely free to walk past.
 *
 * Which moments produce one, and why, is in `lib/game/talk.ts`.
 */
export function TalkNudge({ reason }: { reason: string | null }) {
  if (!reason) return null;

  return (
    <p className="rounded-lg border border-moss-800/50 bg-moss-900/15 px-3 py-2 text-sm text-moss-200">
      {reason}
    </p>
  );
}
