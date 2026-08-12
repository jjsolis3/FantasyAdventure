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
  if (!scene) return new Response("Not found", { status: 404 });

  const membership = await membershipFor(scene.campaignId, user.id);
  if (!membership.isMember) return new Response("Not found", { status: 404 });

  // A drawing the family made beats one the machine made, and the preference
  // lives here rather than in each caller so it holds everywhere a chapter
  // picture appears — the table, the journal, and anywhere added later.
  const drawn = await db.campaignImage.findFirst({
    where: { campaignId: scene.campaignId, kind: "SCENE", key: id },
    select: { data: true, mimeType: true, version: true },
  });

  const picture = drawn ?? scene.image;
  if (!picture) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(picture.data), {
    headers: {
      "Content-Type": picture.mimeType,
      "Content-Length": String(picture.data.length),
      // A generated picture is immutable — it is drawn once and only replaced
      // by deleting the scene. A drawn one can be replaced by a child with a
      // better felt-tip at any moment, so it is revalidated instead.
      "Cache-Control": drawn
        ? "private, max-age=60, must-revalidate"
        : "private, max-age=31536000, immutable",
    },
  });
}
