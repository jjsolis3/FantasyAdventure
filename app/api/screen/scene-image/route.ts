import { db } from "@/lib/db";
import { screenFromRequest } from "@/lib/game/screen";

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
    select: { image: { select: { data: true, mimeType: true, createdAt: true } } },
  });
  if (!scene?.image) return new Response("No picture yet.", { status: 404 });

  return new Response(Buffer.from(scene.image.data), {
    headers: {
      "Content-Type": scene.image.mimeType,
      // A drawn scene never changes, but which scene is current does, so the
      // display asks again on every version change and this only saves the
      // repeat fetches within one scene.
      "Cache-Control": "private, max-age=300",
    },
  });
}
