/**
 * Drawing a chapter, once.
 *
 * Kept out of the turn pipeline deliberately. A turn is already three model
 * calls and a table waiting, and a picture is worth waiting for exactly as long
 * as it takes — which is not the same as making the story wait for it. So this
 * runs on its own, asked for by the page once the scene exists, and if the
 * drawing service is down or unconfigured the adventure carries on without ever
 * mentioning it.
 */

import { db, isUniqueViolation } from "@/lib/db";
import { drawScene, ImagesUnavailableError, sceneArtPrompt } from "@/lib/ai/images";
import { resolveImageConfig } from "@/lib/ai/settings";
import { memberCampaignFilter } from "@/lib/game/access";
import { needsGenerating } from "@/lib/game/scene-picture";

export type SceneArtOutcome =
  | { ok: true; sceneId: string; drawn: boolean }
  | { ok: false; reason: string };

/**
 * Makes sure a scene has a picture, drawing one if it does not.
 *
 * Idempotent by the unique constraint on the scene rather than by checking
 * first: four browsers watching the same chapter appear will all ask at once,
 * and "one of them pays for it" has to be settled by the database rather than
 * by whoever's poll happened to land first.
 */
export async function ensureSceneArt(
  campaignId: string,
  userId: string,
  sceneId: string,
): Promise<SceneArtOutcome> {
  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(campaignId, userId),
    select: {
      id: true,
      title: true,
      tone: true,
      storyline: { select: { title: true, slug: true } },
    },
  });
  if (!campaign) return { ok: false, reason: "Adventure not found." };

  const scene = await db.scene.findFirst({
    where: { id: sceneId, campaignId },
    include: {
      image: { select: { id: true } },
      turns: {
        where: { type: "NARRATION" },
        orderBy: { ordinal: "asc" },
        take: 1,
        select: { content: true },
      },
    },
  });
  if (!scene) return { ok: false, reason: "That chapter is not part of this adventure." };
  if (scene.image) return { ok: true, sceneId, drawn: false };

  // The last gate before spending money and half a minute. A chapter with a
  // picture from any better source — a child's drawing, the adventure's own
  // chapter art, a file shipped with the game — must never reach a model, or a
  // machine's guess ends up painted on top of somebody's felt-tip.
  if (
    !(await needsGenerating({
      campaignId: campaign.id,
      sceneId,
      actIndex: scene.actIndex,
      storylineSlug: campaign.storyline.slug,
    }))
  ) {
    return { ok: true, sceneId, drawn: false };
  }

  const config = await resolveImageConfig();
  if (!config) return { ok: false, reason: "Pictures are switched off for this table." };

  // The scene's opening narration, not its latest: the picture is of where the
  // party is, and the first thing said about a place is the description of it.
  const prompt = sceneArtPrompt({
    storyline: campaign.storyline.title,
    sceneTitle: scene.title,
    location: scene.location,
    narration: scene.turns[0]?.content ?? null,
    tone: campaign.tone,
  });

  try {
    const art = await drawScene(config, prompt);

    await db.sceneImage.create({
      data: {
        sceneId,
        data: art.data,
        mimeType: art.mimeType,
        prompt: art.prompt,
        model: art.model,
      },
    });

    return { ok: true, sceneId, drawn: true };
  } catch (error) {
    // Somebody else's browser got there first, which is a success with a bill
    // attached to a different request.
    if (isUniqueViolation(error)) return { ok: true, sceneId, drawn: false };

    if (error instanceof ImagesUnavailableError) return { ok: false, reason: error.message };
    throw error;
  }
}
