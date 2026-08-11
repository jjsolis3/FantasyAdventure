/**
 * Where they went, in the order they went there.
 *
 * Every scene has always recorded a location, and nothing has ever shown it
 * back. So a family who spent four evenings crossing a valley had no way to see
 * that they had crossed anything — the places went past one at a time and then
 * scrolled out of the transcript.
 *
 * This is deliberately a route rather than a map. There are no coordinates
 * anywhere in the data and inventing some would produce a confident little
 * cartography that contradicts the story — a village drawn east of a river the
 * narration put it west of. A line of places in visit order claims only what is
 * actually known, reads better in a printed journal, and cannot be wrong.
 */

export type SceneLike = {
  index: number;
  actIndex: number;
  title: string;
  location: string | null;
};

export type Stop = {
  /** As the storyteller wrote it the first time the party arrived. */
  location: string;
  /** Where in the story this stop begins. */
  sceneIndex: number;
  actIndex: number;
  /** The scenes that happened here, in order. */
  scenes: string[];
  /** True when the party had been here before and came back. */
  returning: boolean;
};

/**
 * Loose enough to survive the storyteller's own inconsistency.
 *
 * The same place comes back as "the barley field", "The Barley Field" and
 * "barley field" across three scenes, and a route that lists all three as
 * separate stops is worse than no route at all.
 */
function samePlace(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/^(the|a|an)\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Folds a campaign's scenes into the places the party stopped.
 *
 * Consecutive scenes in the same place are one stop — an evening that ran to
 * three scenes in the same kitchen is one visit to the kitchen, not three.
 * Coming back later is a *new* stop, marked as a return, because going back is
 * part of the journey and flattening it would lose the shape of the story.
 *
 * Scenes the storyteller never named a location for attach to the stop before
 * them: the party did not teleport, they were still wherever they were.
 */
export function journeyFrom(scenes: SceneLike[]): Stop[] {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const stops: Stop[] = [];
  const seen = new Set<string>();

  for (const scene of ordered) {
    const named = scene.location?.trim();

    if (!named) {
      // Nowhere named yet. If they are already somewhere, they are still there.
      if (stops.length > 0) stops[stops.length - 1].scenes.push(scene.title);
      continue;
    }

    const key = samePlace(named);
    const current = stops[stops.length - 1];

    if (current && samePlace(current.location) === key) {
      current.scenes.push(scene.title);
      continue;
    }

    stops.push({
      location: named,
      sceneIndex: scene.index,
      actIndex: scene.actIndex,
      scenes: [scene.title],
      returning: seen.has(key),
    });
    seen.add(key);
  }

  return stops;
}

/** How many distinct places the party has been, counting a return once. */
export function placesVisited(stops: Stop[]): number {
  return new Set(stops.map((stop) => samePlace(stop.location))).size;
}
