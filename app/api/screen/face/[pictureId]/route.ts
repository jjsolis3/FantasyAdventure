import { db } from "@/lib/db";
import { screenFromRequest } from "@/lib/game/screen";

export const dynamic = "force-dynamic";

/**
 * A face the family drew, for a television.
 *
 * Takes an id, so the id is checked rather than trusted: the picture must
 * belong to the adventure this screen was adopted into. A screen asking for a
 * picture from somebody else's adventure gets a 404, the same as if it did not
 * exist — which, as far as this television is concerned, it does not.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ pictureId: string }> },
) {
  const { pictureId } = await params;
  const screen = await screenFromRequest(request);
  if (!screen?.campaignId) return new Response("Not paired.", { status: 404 });

  const picture = await db.campaignImage.findFirst({
    where: { id: pictureId, campaignId: screen.campaignId },
    select: { data: true, mimeType: true },
  });
  if (!picture) return new Response("Not found.", { status: 404 });

  return new Response(Buffer.from(picture.data), {
    headers: {
      "Content-Type": picture.mimeType,
      // The version is in the URL the display asks for, so a redrawn face
      // arrives as a different address and this can be held onto.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
