import { db } from "@/lib/db";
import { requireUserForApi } from "@/lib/auth/session";
import { membershipFor } from "@/lib/game/access";

export const dynamic = "force-dynamic";

/**
 * Serves a chapter's picture.
 *
 * Behind the same membership check as everything else, so a picture cannot be
 * linked to somebody outside the adventure — and immutable once drawn, so a
 * phone that has seen it never asks again. Pictures are only ever replaced by
 * being deleted, which changes the scene they belong to as well.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const scene = await db.scene.findUnique({
    where: { id },
    select: { campaignId: true, image: true },
  });
  if (!scene?.image) return new Response("Not found", { status: 404 });

  const membership = await membershipFor(scene.campaignId, user.id);
  if (!membership.isMember) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(scene.image.data), {
    headers: {
      "Content-Type": scene.image.mimeType,
      "Content-Length": String(scene.image.data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
