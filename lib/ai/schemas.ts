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

  /**
   * Two or more of them acting on one plan.
   *
   * Read out of the actions themselves rather than declared by anybody: a girl
   * who writes "I boost Rowan up" and a brother who writes "I reach for the
   * latch" have coordinated, and nothing in the game could see it before this.
   *
   * Which is why it cannot be gamed by *claiming* teamwork — there is no button
   * for it. They have to actually write two actions that serve one plan, and if
   * they end up doing that every turn then the feature has done its job.
   *
   * Defaults to empty, so a model that never uses it simply gives a party the
   * game it had last week rather than one that is broken.
   */
  together: z
    .array(
      z.object({
        /** Two or more party names. One name is not a team. */
        characters: z.array(z.string().min(1)).min(2).max(6),
        /** The single plan they are both serving, for the card and the prose. */
        plan: z.string().min(1).max(200),
      }),
    )
    .max(3)
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
   * The moment the party and the person who keeps turning up crossed paths.
   *
   * Null on almost every turn. Whether they met at all is a fact about the
   * passage and safe to ask a model for; *how often* they are allowed to is
   * not, and is settled server-side by `mayAppear`.
   */
  rivalMet: z
    .object({
      note: z.string().min(1).max(200),
      outcome: z.enum(["PARTY", "RIVAL", "NEITHER"]).default("NEITHER"),
    })
    .nullish(),

  /**
   * Two places the story could go, when a chapter is ending.
   *
   * Exactly two or none. One way on is a corridor, three is a menu, and both
   * are worse than the single choice this exists to offer. Anything that is not
   * a clean pair is dropped rather than repaired — a fork is only worth putting
   * in front of a family when the storyteller genuinely had two ideas.
   */
  waysOn: z
    .array(
      z.object({
        where: z.string().min(1).max(80),
        why: z.string().min(1).max(160),
      }),
    )
    .max(2)
    .default([]),

  /**
   * A moment the passage brushed against somebody's long wish.
   *
   * Proposed here and *filtered* server-side, never taken at face value. The
   * model has no idea how long it has been since the last one, and a small one
   * asked "did you touch her dream?" every turn will find a way to say yes
   * every turn — which turns a year-long ambition into a running joke. See
   * `mayEcho`, which counts the turns the model cannot see.
   *
   * Note what is absent: there is no way to report that a dream was *answered*.
   * That is deliberate and load-bearing. A dream ends when the family says so.
   */
  dreamEchoes: z
    .array(
      z.object({
        character: z.string().min(1),
        /** What the world said or showed, in one sentence. */
        note: z.string().min(1).max(200),
      }),
    )
    .max(2)
    .default([]),

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
   * The handful of things the passage actually put within reach.
   *
   * Born from watching the girls play: a long passage would go by, the question
   * at the end would land, and they would start shouting guesses — a door that
   * was never mentioned, a person who was not there — because by the end of a
   * paragraph the middle of it is gone. The hints button became the way out of
   * that, which is a clue used while the escape room is still running.
   *
   * These are nouns, not suggestions. "The locked shutter", "Bram, who is
   * lying", "the smell of smoke from upstairs". Naming what is present is not
   * telling them what to do with it, and it is the difference between a table
   * that is stuck and a table that is deciding.
   *
   * Empty is allowed and costs nothing; three is the most that fits on a screen
   * a child reads from across a room.
   */
  onTheTable: z.array(z.string().min(1).max(80)).max(3).default([]),

  /**
   * Somewhere worth going next, or somebody worth asking.
   *
   * The gap a real evening found: the game had machinery for the storyteller to
   * *open* an encounter and none at all for it to *place* a lead. So a family
   * would be told to find a sky-map and left with a village and no reason to
   * walk into any particular door — which reads, from the sofa, as the game
   * having no opinion about what they do next.
   *
   * It is the next door, never what is behind it. "The bell-ringer keeps the old
   * charts" is a lead; "the map is in the bell tower" is the answer, and handing
   * that over is the one way to spoil this game.
   *
   * Bounded at two, and empty most turns. A model asked "is there somewhere to
   * go?" every turn will happily invent somewhere every turn, and a signpost at
   * every crossroads is the same thing as no signpost.
   */
  leads: z.array(z.string().min(1).max(120)).max(2).default([]),

  /**
   * Something the passage put in front of them, standing there until dealt with.
   *
   * Null on almost every turn, and the prompt says so twice. An encounter is a
   * scene-sized event — a door opened on somebody already angry, a cellar that
   * locks — and a storyteller that opened one every turn would turn an adventure
   * into a corridor of obstacles.
   */
  encounterOpened: z
    .object({
      name: z.string().min(1).max(80),
      want: z.string().min(1).max(200),
      kind: z.enum(["PERSON", "TRAP", "PUZZLE"]).default("PERSON"),
      nerve: z.enum(["CALM", "TENSE", "FIERCE"]).default("TENSE"),
      works: z.array(z.string().max(120)).max(4).default([]),
      backfires: z.array(z.string().max(120)).max(4).default([]),
      wayOut: z.string().min(1).max(200),
    })
    .nullish(),

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
  /** Same as extraction's, for the one passage extraction never sees. */
  onTheTable: z.array(z.string().min(1).max(80)).max(3).default([]),
});

/**
 * Who took up whose idea, from a turn spent talking.
 *
 * Empty by default and empty on failure, which is the right direction for a
 * bond: one that was not earned is worth less to this family than none at all,
 * and a conversation the model could not read should cost nobody anything.
 */
export const listeningSchema = z.object({
  listened: z
    .array(
      z.object({
        who: z.string().min(1),
        to: z.string().min(1),
        why: z.string().max(200).nullish(),
      }),
    )
    .max(6)
    .default([]),
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
