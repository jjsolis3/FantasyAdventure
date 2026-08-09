/**
 * The contracts the Game Master must satisfy.
 *
 * Kept small on purpose. Every extra field is another thing a 7B model can get
 * wrong, and every optional field is one it will quietly omit — so anything the
 * engine truly needs has a default rather than being required.
 */

import { z } from "zod";
import { STATS } from "@/lib/game/rules";

const statSchema = z.enum(STATS);
const difficultySchema = z.enum(["EASY", "NORMAL", "HARD"]);

/** Stage 1: which of the party's declared actions need a dice check. */
export const adjudicationSchema = z.object({
  checks: z
    .array(
      z.object({
        /** Matched back to a party member by name; ids confuse small models. */
        character: z.string().min(1),
        stat: statSchema,
        difficulty: difficultySchema,
        /** What they are attempting, phrased for narration. */
        intent: z.string().min(1).max(300),
      }),
    )
    .max(8)
    .default([]),
  /** Actions that simply happen — talking, walking, looking around. */
  automatic: z
    .array(
      z.object({
        character: z.string().min(1),
        effect: z.string().min(1).max(300),
      }),
    )
    .max(8)
    .default([]),
});

export type Adjudication = z.infer<typeof adjudicationSchema>;

/** Stage 4: what changed in the world, extracted from the narration. */
export const extractionSchema = z.object({
  /** Short title for the current scene, if it has meaningfully moved on. */
  sceneTitle: z.string().max(120).nullish(),
  location: z.string().max(120).nullish(),

  /** Durable facts worth carrying into later prompts. */
  memories: z
    .array(
      z.object({
        kind: z.enum(["FACT", "NPC", "PLACE", "PLOT_THREAD"]),
        key: z.string().min(1).max(80),
        content: z.string().min(1).max(400),
        importance: z.coerce.number().int().min(1).max(5).default(3),
      }),
    )
    .max(8)
    .default([]),

  /** Characters who did something kind or brave for another character. */
  bondMoments: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        why: z.string().min(1).max(200),
      }),
    )
    .max(6)
    .default([]),

  /** Things the party picked up, was given, or made. */
  itemsGained: z
    .array(
      z.object({
        character: z.string().min(1),
        name: z.string().min(1).max(60),
        description: z.string().max(200).nullish(),
      }),
    )
    .max(6)
    .default([]),

  /** True when the party has clearly finished what this act was about. */
  actComplete: z.coerce.boolean().default(false),
  /** True when the scene has changed place or time enough to close it. */
  sceneComplete: z.coerce.boolean().default(false),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** Scene summary produced when a scene closes. */
export const summarySchema = z.object({
  summary: z.string().min(1).max(1200),
});

/**
 * Ideas offered to a player who has gone blank.
 *
 * Capped short on both ends: a suggestion longer than a sentence stops being a
 * nudge and starts being the game playing itself.
 */
export const suggestionsSchema = z.object({
  suggestions: z.array(z.string().min(3).max(160)).min(1).max(5),
});

/** Wraps Zod into the shape `requestStructured` expects. */
export function validator<T>(schema: z.ZodType<T>) {
  return (value: unknown): { ok: true; value: T } | { ok: false; error: string } => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return { ok: true, value: parsed.data };

    // Feed the model a compact, readable account of what was wrong — full Zod
    // output is too noisy for a small model to act on.
    const detail = parsed.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: detail };
  };
}
