import { db } from "@/lib/db";
import { requireUserForApi } from "@/lib/auth/session";
import { mayAddPictures } from "@/lib/game/pictures";

export const dynamic = "force-dynamic";

/**
 * The bytes, for anybody at this table.
 *
 * Scoped through the campaign rather than by picture id alone. An id is not a
 * secret — it appears in the gallery's markup — so the check that matters is
 * whether this account is in this adventure at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; pictureId: string }> },
) {
  const { id, pictureId } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  if (!(await mayAddPictures(id, user.id))) {
    return new Response("Not found.", { status: 404 });
  }

  const picture = await db.campaignImage.findFirst({
    where: { id: pictureId, campaignId: id },
    select: { data: true, mimeType: true },
  });
  if (!picture) return new Response("Not found.", { status: 404 });

  return new Response(Buffer.from(picture.data), {
    headers: {
      "Content-Type": picture.mimeType,
      // Held onto hard, because the version is part of the URL the gallery
      // asks for — a replaced picture arrives as a different address rather
      // than as the same one that has quietly changed.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/**
 * Takes one down.
 *
 * Anybody at the table, matching who may add one. A picture is not a thing to
 * be protected from the people who made it, and a drawing somebody is unhappy
 * with should not need a grown-up to remove.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; pictureId: string }> },
) {
  const { id, pictureId } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  if (!(await mayAddPictures(id, user.id))) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  await db.campaignImage.deleteMany({ where: { id: pictureId, campaignId: id } });
  return Response.json({ ok: true });
}
