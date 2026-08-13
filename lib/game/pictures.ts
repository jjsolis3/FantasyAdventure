/**
 * Pictures the family made.
 *
 * The rules about who may add one, what counts as a picture, and how a thing is
 * addressed, all in one file — because there are now three places that store
 * image bytes (character portraits, generated scene art, and these) and the
 * differences between them are the interesting part.
 *
 * ## Who may add one
 *
 * Anybody at the table, not only the host. This is deliberate and it is the
 * whole point of the feature: the person most likely to have drawn the beekeeper
 * is a ten-year-old, and making her ask a grown-up to upload her own drawing
 * would take the best thing about this and file it under admin.
 *
 * It is also low-stakes in a way the other permissions are not. A picture can be
 * replaced by anybody who can add one, it affects one adventure, and the worst
 * case is a sibling putting a silly drawing of a troll on the television — which
 * is, on reflection, the correct outcome.
 *
 * ## What counts as a picture
 *
 * Magic bytes, never the filename or the content type, both of which are
 * whatever the uploader says they are. The shrinking happens in the browser
 * (see `lib/images/shrink.ts`), so what arrives here should already be small;
 * the cap is here because "should" is not a guarantee.
 */

import { db } from "@/lib/db";
import { memberCampaignFilter } from "@/lib/game/access";

export type PictureKind = "SCENE" | "PERSON" | "PLACE";

/**
 * A hard ceiling on what may be stored, after the browser has already shrunk it.
 *
 * Slightly larger than the portrait cap, because scenery is stored wide rather
 * than squared off and carries about twice the pixels at the same quality.
 */
export const MAX_PICTURE_BYTES = 2_500_000;

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

export function sniffImage(data: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (signature.bytes.every((byte, index) => data[index] === byte)) return signature.mime;
  }
  return null;
}

/**
 * How a person or a place is addressed.
 *
 * The storyteller will call the same character "the beekeeper", "The Beekeeper"
 * and "the beekeeper." across three turns, and three separate rows would mean a
 * family drawing him once and then being asked to draw him again. Folded the
 * same way `practiceKey` folds what she has been practising — lower case,
 * letters only — so all three land on one picture.
 *
 * A scene is addressed by its id instead, because scene titles repeat across
 * adventures and an id cannot be misread.
 */
export function pictureKey(name: string): string {
  // Order matters here, and the first version of this got it wrong: stripping
  // the article before collapsing whitespace meant a name that arrived padded
  // — "  The Beekeeper  " — never matched the anchor, so it kept its "the" and
  // became a second person the family would be asked to draw again.
  return name
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/u, "");
}

export type StoredPicture = {
  id: string;
  kind: PictureKind;
  key: string;
  label: string;
  version: number;
  uploadedBy: string | null;
};

/** Every picture this adventure has, for the gallery and for the display. */
export async function picturesFor(campaignId: string): Promise<StoredPicture[]> {
  const rows = await db.campaignImage.findMany({
    where: { campaignId },
    // The bytes are deliberately not selected. This is called on pages that
    // render a dozen of these, and pulling megabytes into memory to decide
    // whether a picture exists would be the single most expensive mistake in
    // the file.
    select: {
      id: true,
      kind: true,
      key: true,
      label: true,
      version: true,
      uploadedBy: { select: { displayName: true } },
    },
    orderBy: { label: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    key: row.key,
    label: row.label,
    version: row.version,
    uploadedBy: row.uploadedBy?.displayName ?? null,
  }));
}

/** Whether this account may add a picture to this adventure. */
export async function mayAddPictures(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(campaignId, userId),
    select: { id: true },
  });
  return campaign !== null;
}

export type SaveOutcome = { ok: true; version: number } | { ok: false; reason: string };

/**
 * Stores a picture, replacing whatever was there for the same thing.
 *
 * Replacing rather than adding is what keeps the gallery a gallery: a family
 * that redraws the beekeeper wants the better drawing, not a shelf of six
 * attempts. The version rises so every device that cached the old one asks
 * again.
 */
export async function savePicture(input: {
  campaignId: string;
  userId: string;
  kind: PictureKind;
  key: string;
  label: string;
  data: Uint8Array;
}): Promise<SaveOutcome> {
  const mimeType = sniffImage(input.data);
  if (!mimeType) {
    return { ok: false, reason: "That does not look like a picture. Try a PNG, a JPEG or a WEBP." };
  }
  if (input.data.byteLength > MAX_PICTURE_BYTES) {
    return { ok: false, reason: "That picture is too big. It should have been shrunk first." };
  }
  if (!input.key.trim() || !input.label.trim()) {
    return { ok: false, reason: "A picture needs to be of something." };
  }

  // Copied into a fresh buffer: a Uint8Array read off a request can be a view
  // onto a larger pooled buffer, and storing the view stores the pool.
  const bytes = new Uint8Array(new ArrayBuffer(input.data.byteLength));
  bytes.set(input.data);

  const saved = await db.campaignImage.upsert({
    where: {
      campaignId_kind_key: {
        campaignId: input.campaignId,
        kind: input.kind,
        key: input.key,
      },
    },
    create: {
      campaignId: input.campaignId,
      kind: input.kind,
      key: input.key,
      label: input.label.trim(),
      data: bytes,
      mimeType,
      uploadedById: input.userId,
    },
    update: {
      data: bytes,
      mimeType,
      label: input.label.trim(),
      uploadedById: input.userId,
      version: { increment: 1 },
    },
    select: { version: true },
  });

  return { ok: true, version: saved.version };
}
