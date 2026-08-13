/**
 * The things in an adventure that are worth a picture.
 *
 * Nothing here is new data. The storyteller has been recording who the party
 * meets and where they go since the memory system was built — `Memory` rows of
 * kind `NPC` and `PLACE` — and the scenes are simply the chapters they have
 * played. What was missing was anywhere to see that list and say "I drew this
 * one".
 *
 * So the gallery is generated rather than curated: everybody the story has
 * bothered to remember shows up, whether or not anyone has drawn them. An empty
 * frame with a name under it is an invitation; a page that only lists what has
 * already been drawn would be a page nobody adds to.
 */

import { db } from "@/lib/db";
import { pictureKey, type PictureKind } from "@/lib/game/pictures";

export type Subject = {
  kind: PictureKind;
  key: string;
  label: string;
  /** A line of context under the name, so a child knows which one this is. */
  about: string | null;
};

/**
 * Everybody met, everywhere been, every chapter played.
 *
 * Ordered people first, then places, then chapters — which is the order they
 * matter to somebody holding a felt-tip. A face is the thing worth drawing; a
 * chapter is the thing worth drawing when you have run out of faces.
 */
export async function pictureSubjects(campaignId: string): Promise<Subject[]> {
  const [memories, scenes] = await Promise.all([
    db.memory.findMany({
      where: { campaignId, kind: { in: ["NPC", "PLACE"] } },
      select: { kind: true, key: true, content: true },
      orderBy: { importance: "desc" },
    }),
    db.scene.findMany({
      where: { campaignId },
      select: { id: true, index: true, title: true, location: true },
      orderBy: { index: "asc" },
    }),
  ]);

  const subjects: Subject[] = [];
  const seen = new Set<string>();

  for (const memory of memories) {
    const kind: PictureKind = memory.kind === "NPC" ? "PERSON" : "PLACE";
    // The storyteller names the same person three ways across three turns, so
    // the key is folded — otherwise a family draws the beekeeper and is then
    // asked to draw "The Beekeeper" as well.
    const key = pictureKey(memory.key);
    const address = `${kind}:${key}`;
    if (!key || seen.has(address)) continue;
    seen.add(address);

    subjects.push({
      kind,
      key,
      // The memory key is how the storyteller referred to them, which is
      // already the name a child would use.
      label: titleCase(memory.key),
      about: memory.content,
    });
  }

  for (const scene of scenes) {
    subjects.push({
      kind: "SCENE",
      // Scenes are addressed by id: titles repeat across adventures, and an id
      // cannot be misread.
      key: scene.id,
      label: scene.title,
      about: scene.location,
    });
  }

  return subjects;
}

/** "the beekeeper" -> "The beekeeper". Left alone if it already has capitals. */
function titleCase(name: string): string {
  const trimmed = name.trim();
  if (trimmed !== trimmed.toLocaleLowerCase()) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}
