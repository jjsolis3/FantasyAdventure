/**
 * Asking for a picture of a scene.
 *
 * Talks to the OpenAI images endpoint shape (`POST /images/generations`), which
 * is what OpenAI, Azure and most compatible services expose. There is no
 * Anthropic path here because Anthropic does not draw; a table using Claude as
 * its storyteller points this at somebody else, which is exactly why it is
 * configured separately.
 *
 * The prompt is built rather than passed through. What the storyteller wrote is
 * prose for children, but it is still model output, and handing it verbatim to
 * a second model as an instruction is how one loose sentence becomes a picture
 * nobody wanted. So the narration is trimmed to its scene-setting, stripped of
 * anything that reads as an instruction, and wrapped in a style and a subject
 * this game is willing to put in front of a seven-year-old.
 */

export type ImageConfig = {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
};

export class ImagesUnavailableError extends Error {}

export type SceneArt = {
  /** Pinned to a plain ArrayBuffer, which is what Prisma's Bytes column takes. */
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
  prompt: string;
  model: string;
};

/** How much of the narration is worth describing. Beyond this it is plot. */
const NARRATION_BUDGET = 700;

/**
 * The look of the whole game, in one string.
 *
 * Exported because pictures now come from two places — asked for from a drawing
 * model, or painted by somebody at the table and uploaded — and the two have to
 * end up looking like one game rather than two. Anything that builds a prompt,
 * including the sheet a family generates their own art from, starts here.
 */
export const STYLE =
  "Soft warm storybook watercolour illustration for a children's picture book. " +
  "Gentle candlelit palette, rounded friendly shapes, painterly texture, no text, " +
  "no words, no lettering, no speech bubbles, no frames or borders.";

export const SUBJECT_RULES =
  "Show the place and the moment, as a wide establishing view. Nothing frightening, " +
  "no injuries, no weapons raised, no blood, nobody in danger. If people appear they " +
  "are small in the frame and seen from behind or at a distance.";

/**
 * What the story's mood asks of a picture.
 *
 * Spooky used to fall through to the cosy line, so an adventure written to be
 * unsettling was illustrated as though it were a warm evening in — the one place
 * in the game where the art actively argued with the writing. It gets its own
 * line now, and that line is careful: unsettling is a matter of light and empty
 * space, never of anything frightening in the frame. The subject rules above
 * still hold, and they still say nobody is in danger.
 */
export function moodFor(tone: string): string {
  if (tone === "ADVENTUROUS") return "Adventurous and a little wild, but still safe and warm.";
  if (tone === "SPOOKY") {
    return (
      "Hushed and a little eerie: dusk or lamplight, long shadows, mist, one window lit " +
      "in a dark shape. Quiet and still rather than scary — nothing menacing, nothing " +
      "monstrous, nobody afraid."
    );
  }
  return "Cosy, kind and unhurried.";
}

/**
 * Turns a scene into something safe to ask for.
 *
 * Exported for its own sake: this is the part worth being able to read back
 * when a picture comes out strange, and the part worth testing without a
 * network.
 */
export function sceneArtPrompt(input: {
  storyline: string;
  sceneTitle: string;
  location?: string | null;
  narration?: string | null;
  tone: string;
}): string {
  const setting = describable(input.narration ?? "").slice(0, NARRATION_BUDGET);

  return [
    STYLE,
    SUBJECT_RULES,
    moodFor(input.tone),
    `Scene: ${input.sceneTitle}${input.location ? `, at ${input.location}` : ""}.`,
    `From a gentle family fantasy story called ${input.storyline}.`,
    setting ? `What is happening: ${setting}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Strips the parts of narration that would read as instructions to the drawing
 * model rather than as description — anything addressed to the reader, and the
 * dialogue, which is the half of a scene a picture cannot show anyway.
 */
function describable(narration: string): string {
  return narration
    .replace(/[“"”][^“"”]*[“"”]/g, "")
    // Second person is how narration talks to the table, and how a prompt talks
    // to a drawing model — so it is turned into description of somebody else
    // before the two can be mistaken for each other.
    .replace(/\byours\b/gi, "theirs")
    .replace(/\byour\b/gi, "their")
    .replace(/\byourselves\b/gi, "themselves")
    .replace(/\byourself\b/gi, "themselves")
    .replace(/\byou\b/gi, "they")
    .replace(/\s+/g, " ")
    .trim();
}

/** Requests the picture. Returns the bytes; storing them is the caller's job. */
export async function drawScene(config: ImageConfig, prompt: string): Promise<SceneArt> {
  if (!config.baseUrl || !config.model) {
    throw new ImagesUnavailableError(
      "Pictures are switched on but no drawing service is configured. " +
        "An administrator can set one at Settings → Storyteller.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/images/generations`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        // Square, and the cheapest size that still looks like a painting on a
        // phone. A picture nobody can afford to draw is worth less than a
        // slightly soft one.
        size: "1024x1024",
      }),
    });
  } catch (error) {
    throw new ImagesUnavailableError(
      error instanceof Error && error.name === "AbortError"
        ? "The drawing took too long and was given up on."
        : "The drawing service could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ImagesUnavailableError(
      `The drawing service replied ${response.status}. ${firstLine(detail)}`.trim(),
    );
  }

  const body = (await response.json().catch(() => null)) as {
    data?: { b64_json?: string; url?: string }[];
  } | null;

  const first = body?.data?.[0];
  if (first?.b64_json) {
    return {
      data: bytesFrom(Buffer.from(first.b64_json, "base64")),
      mimeType: "image/png",
      prompt,
      model: config.model,
    };
  }

  // Some services hand back a link rather than the bytes. Fetching it here is
  // what makes the picture ours: those links expire within the hour.
  if (first?.url) {
    const fetched = await fetch(first.url).catch(() => null);
    if (fetched?.ok) {
      return {
        data: bytesFrom(await fetched.arrayBuffer()),
        mimeType: fetched.headers.get("content-type") ?? "image/png",
        prompt,
        model: config.model,
      };
    }
  }

  throw new ImagesUnavailableError("The drawing service sent back nothing that looked like a picture.");
}

/** Copies into a plain, non-shared buffer, which is what the database column wants. */
function bytesFrom(source: ArrayBufferLike | Uint8Array): Uint8Array<ArrayBuffer> {
  const view = source instanceof Uint8Array ? source : new Uint8Array(source);
  const copy = new Uint8Array(new ArrayBuffer(view.byteLength));
  copy.set(view);
  return copy;
}

function firstLine(text: string): string {
  return text.split("\n")[0]?.slice(0, 200) ?? "";
}
