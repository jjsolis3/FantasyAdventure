/**
 * What picture a chapter gets, and where it comes from.
 *
 * There are now four possible answers and they have a strict order. Written in
 * one place because four callers need the same answer — the page at the table,
 * the route that serves the bytes, the television, and the code that decides
 * whether to ask a drawing service for anything at all — and four copies of a
 * precedence rule is four chances for the table and the TV to show different
 * pictures of the same scene.
 *
 * The order, most specific first:
 *
 *   1. **This family's own drawing of this scene.** Somebody at this table drew
 *      it. Nothing beats that.
 *   2. **The adventure's chapter art.** Made once for this storyline, seen by
 *      everybody who plays it — either uploaded by whoever runs this copy, or
 *      shipped in the repository.
 *   3. **A generated picture.** What the drawing service made, if one is
 *      configured and has been asked.
 *   4. **Nothing yet**, which is the cue to ask.
 *
 * The important consequence is at the bottom: generation is only ever reached
 * when the first three did not answer. A family who has drawn their chapters,
 * or is playing an adventure that ships with art, never waits for a drawing
 * service and never pays for one.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

export type ScenePicture =
  /** Somebody at this table drew this scene. */
  | { source: "DRAWN"; url: string }
  /** The adventure's own chapter art, uploaded to this copy of the game. */
  | { source: "CHAPTER"; url: string }
  /** Chapter art shipped as a file in the repository. */
  | { source: "SHIPPED"; url: string }
  /** The drawing service made one. */
  | { source: "GENERATED"; url: string }
  /** Nothing, which is the only case where asking for one is worth doing. */
  | { source: "NONE" };

/**
 * Where chapter art shipped with the game lives.
 *
 * `public/adventures/<slug>/act-<n>.<ext>`, which is exactly what
 * `npm run art:prompts` suggests as a filename for each chapter it writes a
 * prompt for. Dropping the files there and redeploying is all it takes — no
 * database, no upload, and it survives a database being wiped entirely.
 */
const SHIPPED_ROOT = join(process.cwd(), "public", "adventures");
const EXTENSIONS = ["webp", "png", "jpg", "jpeg"];

/**
 * Whether a chapter has a file shipped for it, remembered after the first look.
 *
 * The filesystem cannot change without a redeploy, and a redeploy restarts the
 * process, so a cache here is exact rather than merely fast. Without it every
 * scene render would stat four paths.
 */
const shippedCache = new Map<string, string | null>();

export function shippedChapterArt(slug: string, actIndex: number): string | null {
  const key = `${slug}/${actIndex}`;
  const cached = shippedCache.get(key);
  if (cached !== undefined) return cached;

  let found: string | null = null;
  for (const extension of EXTENSIONS) {
    const relative = `adventures/${slug}/act-${actIndex}.${extension}`;
    if (existsSync(join(SHIPPED_ROOT, slug, `act-${actIndex}.${extension}`))) {
      found = `/${relative}`;
      break;
    }
  }

  shippedCache.set(key, found);
  return found;
}

/** Everything the ladder needs about a scene, so callers can fetch it once. */
export type SceneContext = {
  campaignId: string;
  sceneId: string;
  actIndex: number;
  storylineSlug: string;
};

/**
 * Walks the ladder.
 *
 * Returns a URL rather than bytes: three of the four answers are served by
 * different routes, and a caller that only wants to know *whether* there is a
 * picture should not pull megabytes out of the database to find out.
 */
export async function scenePicture(scene: SceneContext): Promise<ScenePicture> {
  const [drawn, chapter, generated] = await Promise.all([
    db.campaignImage.findFirst({
      where: { campaignId: scene.campaignId, kind: "SCENE", key: scene.sceneId },
      select: { id: true, version: true },
    }),
    db.chapterImage.findUnique({
      where: {
        storylineSlug_actIndex: { storylineSlug: scene.storylineSlug, actIndex: scene.actIndex },
      },
      select: { id: true, version: true },
    }),
    db.sceneImage.findUnique({ where: { sceneId: scene.sceneId }, select: { id: true } }),
  ]);

  if (drawn) {
    return {
      source: "DRAWN",
      url: `/api/campaigns/${scene.campaignId}/pictures/${drawn.id}?v=${drawn.version}`,
    };
  }
  if (chapter) {
    return {
      source: "CHAPTER",
      url: `/api/chapters/${scene.storylineSlug}/${scene.actIndex}?v=${chapter.version}`,
    };
  }

  const shipped = shippedChapterArt(scene.storylineSlug, scene.actIndex);
  if (shipped) return { source: "SHIPPED", url: shipped };

  if (generated) return { source: "GENERATED", url: `/api/scenes/${scene.sceneId}/image` };

  return { source: "NONE" };
}

/**
 * Whether asking a drawing service for this chapter is worth doing.
 *
 * The single question the turn pipeline and the play page actually have, and
 * the reason this module exists: a chapter that already has a picture — from
 * any of the three better sources — must never be sent to a model. That costs
 * money, takes half a minute, and would end with a machine's guess sitting on
 * top of a child's drawing.
 */
export async function needsGenerating(scene: SceneContext): Promise<boolean> {
  return (await scenePicture(scene)).source === "NONE";
}
