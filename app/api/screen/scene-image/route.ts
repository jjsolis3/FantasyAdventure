import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { screenFromRequest } from "@/lib/game/screen";
import { shippedChapterArt } from "@/lib/game/scene-picture";

/** Worked out from the name, because a file on disk has no stored type. */
function mimeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export const dynamic = "force-dynamic";

/**
 * The picture of the chapter, for a television.
 *
 * A separate route from the one players use rather than a second branch inside
 * it. The player route authorises through an account; this one authorises
 * through a screen token, and the two want different `where` clauses. Keeping
 * them apart means neither can be loosened by a change meant for the other.
 *
 * Note what is *not* a parameter: which scene. A television does not get to ask
 * for a scene by id, because then the rule would be "the screen may read scenes
 * it names, as long as we check them". Instead the route works out the current
 * scene of the paired adventure itself. The screen names nothing.
 */
export async function GET(request: Request) {
  const screen = await screenFromRequest(request);
  if (!screen?.campaignId) return new Response("Not paired.", { status: 404 });

  const scene = await db.scene.findFirst({
    where: { campaignId: screen.campaignId, status: "OPEN" },
    orderBy: { index: "desc" },
    select: {
      id: true,
      actIndex: true,
      image: { select: { data: true, mimeType: true } },
      campaign: { select: { storyline: { select: { slug: true } } } },
    },
  });
  if (!scene) return new Response("No picture yet.", { status: 404 });

  // A drawing this family made wins, then the adventure's own chapter art, then
  // a generated one — the same ladder the table uses, so the two screens can
  // never show different pictures of the same chapter.
  const [drawn, chapter] = await Promise.all([
    db.campaignImage.findFirst({
      where: { campaignId: screen.campaignId, kind: "SCENE", key: scene.id },
      select: { data: true, mimeType: true },
    }),
    db.chapterImage.findUnique({
      where: {
        storylineSlug_actIndex: {
          storylineSlug: scene.campaign.storyline.slug,
          actIndex: scene.actIndex,
        },
      },
      select: { data: true, mimeType: true },
    }),
  ]);

  // Art shipped as a file is served by Next from `public/`, which a television
  // holding only a screen token cannot be redirected to usefully — so it is
  // read off disk here and handed over like any other picture.
  const shipped =
    !drawn && !chapter ? shippedChapterArt(scene.campaign.storyline.slug, scene.actIndex) : null;
  if (shipped) {
    const file = await readFile(join(process.cwd(), "public", shipped)).catch(() => null);
    if (file) {
      return new Response(new Uint8Array(file), {
        headers: {
          "Content-Type": mimeFor(shipped),
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  const picture = drawn ?? chapter ?? scene.image;
  if (!picture) return new Response("No picture yet.", { status: 404 });

  return new Response(Buffer.from(picture.data), {
    headers: {
      "Content-Type": picture.mimeType,
      // A drawn scene never changes, but which scene is current does, so the
      // display asks again on every version change and this only saves the
      // repeat fetches within one scene.
      "Cache-Control": "private, max-age=300",
    },
  });
}
