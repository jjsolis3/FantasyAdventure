"use client";

import { useEffect, useState } from "react";

/**
 * The picture of the chapter the party is in.
 *
 * Asked for by whoever opens the page first, and then simply there for everyone
 * else. Deliberately undemanding about failure: a table whose drawing service is
 * misconfigured, out of credit or merely slow should notice nothing except the
 * absence of a picture, because the story is the thing and this is decoration.
 *
 * Only one browser ever pays for a given chapter — the unique constraint on the
 * scene settles that on the server — but they will all ask at once, so the ask
 * is cheap and its refusal is silent.
 */
export function ScenePicture({
  campaignId,
  sceneId,
  sceneTitle,
  hasImage,
  pictureUrl,
  enabled,
}: {
  campaignId: string;
  sceneId: string;
  sceneTitle: string;
  /** True when this chapter already has a picture, from any source. */
  hasImage: boolean;
  /**
   * Where to fetch it, decided on the server by the precedence ladder in
   * `lib/game/scene-picture.ts` — a drawing this family made, the adventure's
   * own chapter art, a file shipped with the game, or a generated one.
   *
   * Passed in rather than built here, because deciding it in two places is how
   * the table ends up showing a different picture from the television.
   */
  pictureUrl: string | null;
  /** False when the table has not switched pictures on. */
  enabled: boolean;
}) {
  const [ready, setReady] = useState(hasImage);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    setReady(hasImage);
  }, [hasImage, sceneId]);

  useEffect(() => {
    if (!enabled || ready || drawing) return;

    let live = true;
    setDrawing(true);

    fetch(`/api/campaigns/${campaignId}/scene-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (live && data) setReady(true);
      })
      .catch(() => {
        // Quietly. There is a story on the page either way.
      })
      .finally(() => {
        if (live) setDrawing(false);
      });

    return () => {
      live = false;
    };
    // Only on arriving at a chapter without a picture; a failure is not retried
    // on every render, which would be a bill rather than a bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, sceneId, enabled, ready]);

  if (!enabled) return null;

  if (!ready) {
    return drawing ? (
      <div className="flex aspect-[3/2] w-full items-center justify-center rounded-xl border border-hearth-800/60 bg-hearth-900/30">
        <p className="flex items-center gap-3 text-sm text-hearth-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-hearth-500" />
          Painting this chapter…
        </p>
      </div>
    ) : null;
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-hearth-800/60">
      {/* Plain img: the bytes come from our own route behind the same sign-in
          as the story, and Next's optimiser would only add a second fetch of a
          picture that is already exactly the size it is shown at. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pictureUrl ?? `/api/scenes/${sceneId}/image`}
        alt={`An illustration of ${sceneTitle}`}
        className="block w-full"
        loading="lazy"
      />
    </figure>
  );
}
