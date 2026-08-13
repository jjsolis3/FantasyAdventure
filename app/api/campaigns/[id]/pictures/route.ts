import { requireUserForApi } from "@/lib/auth/session";
import {
  MAX_PICTURE_BYTES,
  mayAddPictures,
  picturesFor,
  savePicture,
  type PictureKind,
} from "@/lib/game/pictures";

export const dynamic = "force-dynamic";

const KINDS: PictureKind[] = ["SCENE", "PERSON", "PLACE"];

/** What this adventure has so far. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  if (!(await mayAddPictures(id, user.id))) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  return Response.json({ pictures: await picturesFor(id) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Adds one, or replaces the one that was there.
 *
 * Open to anybody travelling in this adventure rather than to the host alone —
 * the person most likely to have drawn the beekeeper is the ten-year-old who
 * met him, and making her ask a grown-up to upload her own drawing would take
 * the best thing about this feature and file it under admin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  if (!(await mayAddPictures(id, user.id))) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("picture");
  const kind = String(form?.get("kind") ?? "");
  const key = String(form?.get("key") ?? "");
  const label = String(form?.get("label") ?? "");

  if (!(file instanceof File)) {
    return Response.json({ error: "No picture was sent." }, { status: 400 });
  }
  if (!KINDS.includes(kind as PictureKind)) {
    return Response.json({ error: "A picture has to be of a person, a place or a chapter." }, { status: 400 });
  }
  // Checked before the bytes are read as well as inside `savePicture`, so an
  // oversized upload is refused without being pulled into memory first.
  if (file.size > MAX_PICTURE_BYTES) {
    return Response.json(
      { error: "That picture is too big. It should have been shrunk before sending." },
      { status: 413 },
    );
  }

  const outcome = await savePicture({
    campaignId: id,
    userId: user.id,
    kind: kind as PictureKind,
    key,
    label,
    data: new Uint8Array(await file.arrayBuffer()),
  });
  if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 400 });

  return Response.json({ ok: true, version: outcome.version });
}
