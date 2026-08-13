import { db } from "@/lib/db";
import { requireAdmin, requireUserForApi } from "@/lib/auth/session";
import { sniffImage, MAX_PICTURE_BYTES } from "@/lib/game/pictures";

export const dynamic = "force-dynamic";

/**
 * Chapter art for one adventure.
 *
 * Addressed by slug and act number rather than by act id, because the seed
 * deletes and recreates every act row on container start — art hung off an id
 * would vanish on the next redeploy.
 *
 * Readable by anybody signed in. This is not private: it is the picture that
 * ships with an adventure, the same one every family who plays it sees, and it
 * appears on the library page before anybody has started anything.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; actIndex: string }> },
) {
  const { slug, actIndex } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const picture = await db.chapterImage.findUnique({
    where: { storylineSlug_actIndex: { storylineSlug: slug, actIndex: Number(actIndex) } },
    select: { data: true, mimeType: true },
  });
  if (!picture) return new Response("Not found.", { status: 404 });

  return new Response(Buffer.from(picture.data), {
    headers: {
      "Content-Type": picture.mimeType,
      // The version is in the URL the page asks for, so a replaced picture
      // arrives as a different address rather than the same one having changed.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/**
 * Puts a picture on a chapter, for everybody who plays this adventure.
 *
 * Administrator-only, unlike the per-family gallery. The difference is who sees
 * it: a drawing in the gallery belongs to one table, and this is the picture
 * every household running this copy of the game will see for that chapter.
 * That is an editorial decision about the shipped library rather than a
 * memento, and it belongs with whoever runs the game.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; actIndex: string }> },
) {
  const { slug, actIndex } = await params;
  const admin = await requireAdmin();

  const index = Number(actIndex);
  if (!Number.isInteger(index) || index < 1) {
    return Response.json({ error: "Which chapter?" }, { status: 400 });
  }

  // Checked against the library so a typo in the address cannot quietly create
  // art for an adventure that does not exist and never show up anywhere.
  const storyline = await db.storyline.findUnique({ where: { slug }, select: { id: true } });
  if (!storyline) return Response.json({ error: "No such adventure." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("picture");
  if (!(file instanceof File)) {
    return Response.json({ error: "No picture was sent." }, { status: 400 });
  }
  if (file.size > MAX_PICTURE_BYTES) {
    return Response.json(
      { error: "That picture is too big. It should have been shrunk before sending." },
      { status: 413 },
    );
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImage(data);
  if (!mimeType) {
    return Response.json(
      { error: "That does not look like a picture. Try a PNG, a JPEG or a WEBP." },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(new ArrayBuffer(data.byteLength));
  bytes.set(data);

  const saved = await db.chapterImage.upsert({
    where: { storylineSlug_actIndex: { storylineSlug: slug, actIndex: index } },
    create: {
      storylineSlug: slug,
      actIndex: index,
      data: bytes,
      mimeType,
      uploadedById: admin.id,
    },
    update: { data: bytes, mimeType, uploadedById: admin.id, version: { increment: 1 } },
    select: { version: true },
  });

  return Response.json({ ok: true, version: saved.version });
}

/** Takes it back off, falling back to whatever the ladder answers next. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; actIndex: string }> },
) {
  const { slug, actIndex } = await params;
  await requireAdmin();

  await db.chapterImage.deleteMany({
    where: { storylineSlug: slug, actIndex: Number(actIndex) },
  });
  return Response.json({ ok: true });
}
