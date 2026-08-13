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
        /**
         * The *kind* of thing being attempted, in a word: "climbing",
         * "persuading", "sneaking".
         *
         * This is what makes practice countable. The intent is a sentence about
         * this particular moment and no two are ever the same; the practice is
         * the thing she keeps doing, and four of them make a skill.
         */
        practice: z.string().max(30).nullish(),
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
        /**
         * What she would need before this is any use to her.
         *
         * The alternative to a gear shop: a silver flute she cannot play yet is
         * a better reason to want to grow than a price tag. Null on almost
         * everything — most objects are just objects.
         */
        requiresSkill: z.string().max(40).nullish(),
        requiresRank: z.coerce.number().int().min(1).max(4).nullish(),
      }),
    )
    .max(6)
    .default([]),

  /**
   * Objectives the party accomplished that are not about holding something.
   *
   * Only ever *matched* against objectives that already exist — the model
   * cannot invent a thing it has done, only report that one of the listed ones
   * happened. Free text because it is describing the moment in its own words.
   */
  deedsDone: z.array(z.string().min(1).max(200)).max(4).default([]),

  /**
   * Errands the storyteller has just introduced and would like on the board.
   *
   * Bounded hard. A model asked "did you start anything?" every single turn
   * will happily say yes every single turn, and a tracker full of errands
   * nobody chose is worse than no tracker at all.
   */
  questsOpened: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        summary: z.string().min(1).max(200),
        objectives: z
          .array(
            z.object({
              kind: z.enum(["FIND", "DEED"]).default("DEED"),
              text: z.string().min(1).max(120),
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .max(2)
    .default([]),

  /**
   * The question the passage leaves the table with.
   *
   * A passage used to end and the screen simply stopped, with two buttons under
   * it and nothing joining the two. Grown-ups hesitated; children waited to be
   * told. What was missing was the thing a person running a game says without
   * thinking — *"the door is open an inch. What do you do?"* — so the storyteller
   * is now asked for it directly.
   *
   * Comes from extraction rather than its own call because extraction has
   * already read the passage, and a fifth stage would add half a minute to every
   * turn on a local model for one sentence.
   */
  whatNow: z.string().max(160).nullish(),

  /**
   * Whether the party got anywhere at all this turn.
   *
   * Defaults to **true**, which is the whole point of the default. This is the
   * second opinion behind the act clock, and the clock only moves when nothing
   * measurable happened *and* this is false. A model that omits the field, or
   * emits something unparseable, therefore lands on "they got somewhere" and
   * costs the party nothing — an unfair tick is felt immediately by a child,
   * and a missed one is invisible.
   */
  movedForward: z.coerce.boolean().default(true),

  /** True when the party has clearly finished what this act was about. */
  actComplete: z.coerce.boolean().default(false),
  /** True when the scene has changed place or time enough to close it. */
  sceneComplete: z.coerce.boolean().default(false),
});

export type Extraction = z.infer<typeof extractionSchema>;

/**
 * The same question, asked on its own.
 *
 * The opening passage runs no extraction — it is written before there is
 * anything to extract — so the one moment that most needs a way in is the one
 * moment the field above cannot cover. This is a small enough call to be worth
 * making once at the start of an adventure, and never again.
 */
export const nudgeSchema = z.object({
  whatNow: z.string().min(1).max(160),
});

/**
 * One aim per character for the chapter ahead.
 *
 * Asked for by name rather than left to the storyteller's discretion, because a
 * model told "give everyone something to do" reliably gives the loudest
 * character three things and the quiet one nothing.
 */
export const personalQuestsSchema = z.object({
  aims: z
    .array(
      z.object({
        character: z.string().min(1),
        title: z.string().min(1).max(80),
        summary: z.string().min(1).max(200),
        /**
         * Deliberately one. A chapter-sized aim with three steps is a second
         * plot competing with the real one, and four of those at a table of
         * four is chaos.
         */
        objective: z.object({
          kind: z.enum(["FIND", "DEED"]).default("DEED"),
          text: z.string().min(1).max(120),
        }),
      }),
    )
    .max(6)
    .default([]),
});

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
