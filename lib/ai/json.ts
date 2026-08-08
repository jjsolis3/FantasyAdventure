/**
 * Getting structured data out of a model that was asked politely for JSON.
 *
 * Small local models wrap JSON in prose, fence it in markdown, add trailing
 * commentary, or emit trailing commas. None of that is worth failing a turn
 * over, so extraction is forgiving — and then Zod is strict about what comes
 * out the other side.
 */

/**
 * Pulls the first plausible JSON object or array out of arbitrary text.
 *
 * Scans for a balanced structure rather than regexing, so braces inside string
 * literals do not confuse it.
 */
export function extractJsonText(raw: string): string | null {
  if (!raw) return null;

  // Strip a markdown fence if the whole payload is wrapped in one.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : raw;

  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

/** Removes trailing commas, which several local models emit habitually. */
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

export type JsonParse<T> = { ok: true; value: T } | { ok: false; error: string };

/** Extracts and parses JSON, tolerating the usual small-model quirks. */
export function parseLooseJson(raw: string): JsonParse<unknown> {
  const extracted = extractJsonText(raw);
  if (extracted === null) {
    return { ok: false, error: "No JSON object or array found in the response." };
  }

  try {
    return { ok: true, value: JSON.parse(extracted) };
  } catch {
    try {
      return { ok: true, value: JSON.parse(stripTrailingCommas(extracted)) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Malformed JSON.",
      };
    }
  }
}

export type StructuredResult<T> = {
  value: T;
  /** How many retries were needed. 0 means it parsed first time. */
  repairs: number;
  raw: string;
};

/**
 * Asks for structured output, validates it, and gives the model one chance to
 * fix its own mistake before giving up.
 *
 * The repair turn feeds the validation error back verbatim. In practice a 7B
 * model that produced the wrong shape usually corrects it when shown exactly
 * what was wrong, and a second failure means the prompt is at fault rather
 * than the sample.
 */
export async function requestStructured<T>(options: {
  /** Runs one completion. `repairHint` is set on retries. */
  call: (repairHint: string | null) => Promise<string>;
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; error: string };
  maxRepairs?: number;
}): Promise<StructuredResult<T>> {
  const maxRepairs = options.maxRepairs ?? 1;

  let lastError = "";
  let lastRaw = "";

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    const hint =
      attempt === 0
        ? null
        : `Your previous reply could not be used: ${lastError}\n` +
          `Reply again with ONLY the JSON object, no explanation, no markdown fence.`;

    const raw = await options.call(hint);
    lastRaw = raw;

    const parsed = parseLooseJson(raw);
    if (!parsed.ok) {
      lastError = parsed.error;
      continue;
    }

    const validated = options.validate(parsed.value);
    if (validated.ok) {
      return { value: validated.value, repairs: attempt, raw };
    }
    lastError = validated.error;
  }

  throw new StructuredOutputError(lastError, lastRaw);
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(`The model did not return usable JSON: ${message}`);
    this.name = "StructuredOutputError";
  }
}
