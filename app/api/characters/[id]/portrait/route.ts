import { db } from "@/lib/db";
import { requireUserForApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * A hard ceiling on what may be stored, after the browser has already shrunk
 * it. Anything arriving larger than this either skipped the resize or is not
 * really a portrait, and both are answered the same way.
 */
const MAX_BYTES = 1_500_000;

/**
 * The first bytes of the formats worth accepting.
 *
 * Sniffed rather than trusted: the content type on an upload is whatever the
 * uploader says it is, and a file that claims to be a PNG and is not would be
 * served back to every player in this family with that claim intact.
 */
const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

function sniff(data: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (signature.bytes.every((byte, index) => data[index] === byte)) return signature.mime;
  }
  return null;
}

/** Stores a picture of an adventurer. Only the household that owns them. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!character) return Response.json({ error: "Adventurer not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("portrait");
  if (!(file instanceof File)) {
    return Response.json({ error: "No picture was sent." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "That picture is too big. It should have been shrunk before sending." },
      { status: 413 },
    );
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniff(data);
  if (!mimeType) {
    return Response.json(
      { error: "That does not look like a picture. Try a PNG, a JPEG or a WEBP." },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(new ArrayBuffer(data.byteLength));
  bytes.set(data);

  await db.characterPortrait.upsert({
    where: { characterId: character.id },
    create: { characterId: character.id, data: bytes, mimeType },
    // The version is what makes a replacement visible: the picture is served
    // with a long cache life, so without it a new portrait would be the old one
    // on every device that had already seen it.
    update: { data: bytes, mimeType, version: { increment: 1 } },
  });

  return Response.json({ ok: true });
}

/** Serves it, to anybody who shares an adventure with them. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const character = await db.character.findFirst({
    where: {
      id,
      OR: [
        { userId: user.id },
        // Somebody at the same table. The portrait appears on the party sheets
        // every player can already see, so this is the same audience.
        {
          partyMemberships: {
            some: {
              campaign: {
                OR: [
                  { ownerId: user.id },
                  { party: { some: { character: { userId: user.id } } } },
                ],
              },
            },
          },
        },
      ],
    },
    select: { portrait: true },
  });

  if (!character?.portrait) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(character.portrait.data), {
    headers: {
      "Content-Type": character.portrait.mimeType,
      "Content-Length": String(character.portrait.data.length),
      // Immutable against the version in the URL; a replacement changes the URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Takes it down again. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!character) return Response.json({ error: "Adventurer not found." }, { status: 404 });

  await db.characterPortrait.deleteMany({ where: { characterId: character.id } });
  return Response.json({ ok: true });
}
