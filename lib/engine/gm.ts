/**
 * The Game Master pipeline.
 *
 * One party turn runs four stages:
 *
 *   1. ADJUDICATE — one JSON call: which declared actions need a dice check
 *   2. ROLL       — the server rolls; the model has no say in outcomes
 *   3. NARRATE    — one prose call, told exactly what the dice decided
 *   4. EXTRACT    — one JSON call: what changed, pulled from the narration
 *
 * Narration and extraction are separate calls on purpose. Asking one response
 * to be both good prose and valid JSON is where small local models fall apart:
 * they either write stilted prose to protect the JSON, or produce lovely prose
 * with unusable JSON stapled on.
 */

import type { Adjudication, Extraction } from "@/lib/ai/schemas";
import { adjudicationSchema, extractionSchema, validator } from "@/lib/ai/schemas";
import { requestStructured, StructuredOutputError } from "@/lib/ai/json";
import { adjudicationPrompt, extractionPrompt, narrationPrompt, systemPrompt, type ReadingLevelKey, type ToneKey } from "@/lib/ai/prompts";
import { checkNarration, safetyReminder } from "@/lib/ai/safety";
import { describeResult, resolveCheck, type CheckRequest, type CheckResult, type Difficulty } from "@/lib/engine/dice";
import type { SignatureEffect } from "@/lib/game/character-options";
import type { StatKey } from "@/lib/game/rules";
import { knackBonusFor } from "@/lib/game/knacks";
import type { AwaitedRoll } from "@/lib/game/table-dice";
import {
  TOGETHER_BONUS,
  namesOf,
  planFor,
  resolvePlans,
  togetherGuidance,
  type SharedPlan,
} from "@/lib/game/together";

/** Everything the pipeline needs, with no database or HTTP knowledge. */
export type TurnInput = {
  context: string;
  tone: ToneKey;
  readingLevel: ReadingLevelKey;
  sceneText: string;
  party: {
    id: string;
    name: string;
    stats: Record<StatKey, number>;
    skills: { name: string; rank: number }[];
    /** Knack keys she has chosen, so their bonuses reach the dice. */
    knacks?: string[];
  }[];
  actions: { characterId: string; text: string }[];
  /**
   * What the table says the previous telling of this turn got wrong.
   *
   * Set only when a turn is being retold after being taken back. It shapes
   * adjudication as well as narration: if the storyteller misread an action,
   * the check it chose was likely wrong too, so re-reading the action has to
   * happen before the dice, not after.
   */
  correction?: string;
  /** Where the story is and how long this family likes an act to run. */
  pacing?: string;
  /**
   * What the act's clock is doing, when it has started moving.
   *
   * Reaches narration only. The dice must not know about it — a clock that
   * quietly made checks harder would be a punishment nobody could see, and the
   * point of this one is that it is visible.
   */
  pressure?: string;
  /**
   * What is standing in front of them, and how it is going.
   *
   * Reaches narration, and — unlike the act clock — the dice as well, because
   * the world rolls its own die while one of these is open. See
   * `lib/game/encounters.ts`.
   */
  encounter?: string;
  /** What the encounter rolled this round, already resolved. */
  worldRoll?: { roll: number; nerve: number; pressed: number; note: string } | null;
  /** Its name, for the line the storyteller is handed about that roll. */
  encounterName?: string;
  /**
   * Objectives on the quest board that are not about carrying something, so the
   * extraction can report which of them the passage just finished rather than
   * inventing achievements.
   */
  openDeeds?: string[];
  /** A Family Move the table chose to spend this turn, if any. */
  familyMove?: {
    key: string;
    moveName: string;
    /** Who is lending the help. */
    helperId: string;
    /** Whose check it applies to. */
    targetId: string;
  } | null;
  /**
   * The once-a-scene and once-a-chapter abilities being spent this turn.
   *
   * Keyed by character, because these belong to a person rather than to a pair
   * — which is exactly what separates them from a Family Move, and why they
   * arrive on each girl's own answer rather than being chosen once at review.
   */
  spentAbilities?: {
    characterId: string;
    characterName: string;
    name: string;
    effect: SignatureEffect;
    narrationHint: string;
  }[];
  /** Set when player input tripped the safety screen. */
  deflectionNote?: string | null;
  /**
   * An adjudication already paid for, when a turn is being resumed.
   *
   * Real dice cut the pipeline in half: the storyteller works out what needs
   * rolling, the table is asked, and the rest of the turn happens later. Handing
   * the answer back rather than asking again is not only cheaper — asking twice
   * could get a *different* answer, and the numbers on the table were thrown
   * against the first one.
   */
  adjudication?: Adjudication;
};

/** Injected so the pipeline can be tested without a model server. */
export type ModelCalls = {
  json: (prompt: string, repairHint: string | null) => Promise<string>;
  prose: (system: string, prompt: string) => Promise<string>;
};

/** Emitted as the pipeline advances, so a slow turn does not look like a hang. */
export type TurnProgress =
  | { type: "stage"; stage: "adjudicating" | "rolling" | "narrating" | "extracting" }
  | { type: "dice"; checks: CheckResult[] }
  /**
   * The turn has stopped and the table is being asked to roll.
   *
   * A progress event rather than a return value because the phone is already
   * listening to this stream: the ask arrives the same way the dice do, and the
   * page does not need a second idea of how a turn talks to it.
   */
  | { type: "awaiting"; awaited: AwaitedRoll[] };

export type TurnResult = {
  adjudication: Adjudication;
  /**
   * Shared plans, already matched to real party members.
   *
   * Handed out rather than left for the caller to work out again from
   * `adjudication.together`: resolving a claim is where the dropped names, the
   * duplicates and the one-person "teams" get filtered, and two callers doing
   * that separately is two chances to disagree about who was working with whom
   * — one paying the dice bonus and the other paying the bond.
   */
  plans: SharedPlan[];
  checks: CheckResult[];
  narration: string;
  extraction: Extraction;
  diagnostics: {
    adjudicationRepairs: number;
    extractionRepairs: number;
    safetyRegenerated: boolean;
    /** Set when adjudication failed and the turn ran without dice. */
    adjudicationFellBack: boolean;
    /** Set when extraction failed; the turn still counts, nothing is recorded. */
    extractionFellBack: boolean;
  };
};

/** Matches a name the model produced back to a real party member. */
function findMember<T extends { name: string }>(party: T[], name: string): T | undefined {
  const needle = name.trim().toLowerCase();
  return (
    party.find((member) => member.name.toLowerCase() === needle) ??
    // Models routinely shorten "Mira Thistledown" to "Mira".
    party.find((member) => member.name.toLowerCase().startsWith(needle)) ??
    party.find((member) => needle.startsWith(member.name.toLowerCase().split(" ")[0]))
  );
}

/** Picks the character's best relevant skill for a check, if any. */
function skillFor(
  member: { skills: { name: string; rank: number }[] },
  intent: string,
): { name: string; rank: number } | undefined {
  const lowered = intent.toLowerCase();
  return member.skills
    .filter((skill) => lowered.includes(skill.name.toLowerCase().split(" ")[0]))
    .sort((a, b) => b.rank - a.rank)[0];
}

/**
 * What a shared plan adds to one person's check, phrased from her side.
 *
 * "with Rowan" rather than "with Mira and Rowan": she knows who she is. Naming
 * her back to herself is the sort of small wrongness a ten-year-old spots
 * immediately and a test never would.
 */
function togetherFor(
  plans: SharedPlan[],
  characterId: string,
  name: string,
): { together?: { with: string; bonus: number } } {
  const plan = planFor(plans, characterId);
  if (!plan) return {};

  const others = { ...plan, names: plan.names.filter((entry) => entry !== name) };
  return { together: { with: namesOf(others), bonus: TOGETHER_BONUS } };
}

/**
 * Just the first stage: what needs rolling, and who is working with whom.
 *
 * Called on its own only when the table is throwing real dice, because that is
 * the one case where the game has to stop and ask a question before it can
 * finish. Shares every line of its logic with the full run by handing the
 * result back to `runTurn` afterwards, so there is no second, subtly different
 * idea of what a check is.
 */
export async function adjudicateOnly(
  input: TurnInput,
  calls: ModelCalls,
  onProgress?: (event: TurnProgress) => void,
): Promise<{ adjudication: Adjudication; plans: SharedPlan[]; fellBack: boolean; repairs: number }> {
  const namedActions = input.actions.map((action) => ({
    character: input.party.find((member) => member.id === action.characterId)?.name ?? "Someone",
    text: action.text,
  }));

  onProgress?.({ type: "stage", stage: "adjudicating" });

  try {
    const result = await requestStructured({
      call: (hint) =>
        calls.json(
          adjudicationPrompt({
            correction: input.correction,
            sceneText: input.sceneText,
            party: input.party.map((member) => `- ${member.name}`).join("\n"),
            actions: namedActions,
          }),
          hint,
        ),
      validate: validator(adjudicationSchema),
    });

    return {
      adjudication: result.value,
      plans: resolvePlans(
        result.value.together ?? [],
        input.party.map((member) => ({ characterId: member.id, name: member.name })),
      ),
      fellBack: false,
      repairs: result.repairs,
    };
  } catch (error) {
    if (!(error instanceof StructuredOutputError)) throw error;

    // Same fallback as the full run: everything declared simply happens. Which
    // means a table waiting to roll is told there is nothing to roll — better
    // than being asked for a number the story has no use for.
    return {
      adjudication: {
        checks: [],
        automatic: namedActions.map((action) => ({ character: action.character, effect: action.text })),
        together: [],
      },
      plans: [],
      fellBack: true,
      repairs: 0,
    };
  }
}

export async function runTurn(
  input: TurnInput,
  calls: ModelCalls,
  roller?: () => number,
  onProgress?: (event: TurnProgress) => void,
): Promise<TurnResult> {
  const diagnostics: TurnResult["diagnostics"] = {
    adjudicationRepairs: 0,
    extractionRepairs: 0,
    safetyRegenerated: false,
    adjudicationFellBack: false,
    extractionFellBack: false,
  };

  const namedActions = input.actions.map((action) => ({
    character: input.party.find((member) => member.id === action.characterId)?.name ?? "Someone",
    text: action.text,
  }));

  // ---- 1. Adjudicate -------------------------------------------------------
  //
  // Skipped entirely when the caller already has one. That is the resumed half
  // of a turn the table rolled real dice for, and re-asking would risk a
  // different answer to a question the dice have already been thrown against.
  if (input.adjudication) {
    return finishTurn(input, input.adjudication, calls, diagnostics, namedActions, roller, onProgress);
  }

  onProgress?.({ type: "stage", stage: "adjudicating" });
  let adjudication: Adjudication = { checks: [], automatic: [], together: [] };
  try {
    const result = await requestStructured({
      call: (hint) =>
        calls.json(
          adjudicationPrompt({
      correction: input.correction,
            sceneText: input.sceneText,
            party: input.party
              .map((member) => `- ${member.name}`)
              .join("\n"),
            actions: namedActions,
          }),
          hint,
        ),
      validate: validator(adjudicationSchema),
    });
    adjudication = result.value;
    diagnostics.adjudicationRepairs = result.repairs;
  } catch (error) {
    // A turn with no dice is a worse turn, not a broken one — everything the
    // players declared simply happens. Far better than showing them an error.
    if (!(error instanceof StructuredOutputError)) throw error;
    diagnostics.adjudicationFellBack = true;
    adjudication = {
      checks: [],
      automatic: namedActions.map((action) => ({ character: action.character, effect: action.text })),
      together: [],
    };
  }

  return finishTurn(input, adjudication, calls, diagnostics, namedActions, roller, onProgress);
}

/**
 * Everything after the storyteller has decided what needs rolling.
 *
 * Split out so a turn can stop in the middle. When the family is throwing their
 * own dice, `adjudicateOnly` runs the first half, the table is asked, and this
 * runs the rest with a roller that hands out the numbers they typed — which is
 * why real dice needed no change whatsoever to how a check resolves. Every
 * modifier, skill, shared plan and lucky break applies exactly as before; the
 * dice simply stopped caring where their numbers came from.
 */
async function finishTurn(
  input: TurnInput,
  adjudication: Adjudication,
  calls: ModelCalls,
  diagnostics: TurnResult["diagnostics"],
  namedActions: { character: string; text: string }[],
  roller?: () => number,
  onProgress?: (event: TurnProgress) => void,
): Promise<TurnResult> {
  // ---- 2. Roll -------------------------------------------------------------
  onProgress?.({ type: "stage", stage: "rolling" });

  // Resolved before any dice, because a shared plan changes every roll inside
  // it and half the party rolling with the bonus and half without would be the
  // worst possible version of this.
  const plans = resolvePlans(
    adjudication.together ?? [],
    input.party.map((member) => ({ characterId: member.id, name: member.name })),
  );

  const checks: CheckResult[] = [];
  for (const requested of adjudication.checks) {
    const member = findMember(input.party, requested.character);
    if (!member) continue; // The model invented someone; quietly drop it.

    const skill = skillFor(member, requested.intent);
    const request: CheckRequest = {
      characterId: member.id,
      characterName: member.name,
      stat: requested.stat as StatKey,
      difficulty: requested.difficulty as Difficulty,
      intent: requested.intent,
      skillRank: skill?.rank,
      skillName: skill?.name,
      // Falls back to the intent when the storyteller does not name a practice.
      // The first word of "climbing the drainpipe to reach the window" is still
      // the right thing to file it under.
      practice: requested.practice?.trim() || requested.intent,
      knackBonus: knackBonusFor(member.knacks ?? [], requested.stat as StatKey),
      ...togetherFor(plans, member.id, member.name),
    };

    // The move applies to the one check it was aimed at, and only if that
    // character actually ended up rolling.
    const move =
      input.familyMove && input.familyMove.targetId === member.id
        ? {
            key: input.familyMove.key,
            moveName: input.familyMove.moveName,
            helperName:
              input.party.find((entry) => entry.id === input.familyMove!.helperId)?.name ?? "Someone",
          }
        : undefined;

    // Hers, and everybody else's that helps her. A boost never reaches its own
    // owner: "everyone else's next roll goes better. Never your own" is written
    // in the blurb a child reads, so it is enforced here rather than trusted.
    const own = (input.spentAbilities ?? []).find((spend) => spend.characterId === member.id);
    const boost = (input.spentAbilities ?? []).find(
      (spend) => spend.characterId !== member.id && spend.effect.kind === "BOOST_OTHERS",
    );

    checks.push(
      resolveCheck(request, member.stats, roller, move, {
        own: own ? { name: own.name, effect: own.effect } : null,
        boost:
          boost && boost.effect.kind === "BOOST_OTHERS"
            ? { amount: boost.effect.amount, fromName: boost.characterName }
            : null,
      }),
    );
  }

  // The dice go out before the narration is written. On a local model that
  // wait is 20-40 seconds, and watching the rolls land is the fun part anyway.
  onProgress?.({ type: "dice", checks });

  // ---- 3. Narrate ----------------------------------------------------------
  onProgress?.({ type: "stage", stage: "narrating" });
  // Put first, and stated as a thing that has happened rather than a thing
  // that might. A spent ability is the moment a girl has been saving, and the
  // narration landing somewhere else is the one outcome that makes spending it
  // feel worse than not bothering. The dice have already applied whatever was
  // mechanical; this is so the prose knows it happened at all — the narrative
  // ones have nothing but this line to go on.
  const spends = (input.spentAbilities ?? []).map(
    (spend) =>
      `${spend.characterName} uses ${spend.name} — this is happening, narrate it: ${spend.narrationHint}`,
  );

  const shared = togetherGuidance(plans);

  // The world's own roll, told as a thing that happened rather than a number.
  // Ahead of the party's results because it is what they were rolling against,
  // and a passage that describes her success and then remembers the customer
  // was shouting has the order backwards.
  const world = input.worldRoll
    ? [
        `${input.encounterName ?? "It"} rolls ${input.worldRoll.roll} against them. ` +
          `${input.worldRoll.note} ` +
          (input.worldRoll.pressed > 0
            ? "Show it pushing back in this passage — it is not waiting politely."
            : "It falters for a beat, and they get a chance to use."),
      ]
    : [];

  const resolutions = [
    ...world,
    // Ahead of the individual results, because it changes how all of them
    // should be read. A passage told "Mira rolled well" and then "they were
    // working together" writes the success first and remembers the sister
    // afterwards, which is the wrong way round for the thing this rewards.
    ...(shared ? [shared] : []),
    ...spends,
    ...checks.map(describeResult),
    ...adjudication.automatic.map((entry) => `${entry.character}: ${entry.effect} (happens automatically)`),
  ].join("\n\n");

  const system = systemPrompt({ tone: input.tone, readingLevel: input.readingLevel });
  const basePrompt = narrationPrompt({
      correction: input.correction,
    context: input.context,
    actions: namedActions,
    resolutions: resolutions || "Nothing needed a dice roll this turn.",
    pressure: input.pressure,
    encounter: input.encounter,
  });

  let narration = await calls.prose(
    system,
    input.deflectionNote ? `${basePrompt}\n\n${input.deflectionNote}` : basePrompt,
  );

  const verdict = checkNarration(narration);
  if (!verdict.ok) {
    diagnostics.safetyRegenerated = true;
    narration = await calls.prose(system, `${basePrompt}\n\n${safetyReminder(verdict.matched)}`);

    // If it trips twice, keep the text but strip the offending word rather
    // than showing the table an error or an empty scene.
    const second = checkNarration(narration);
    if (!second.ok) {
      narration = narration.replace(new RegExp(second.matched, "gi"), "…");
    }
  }

  // ---- 4. Extract ----------------------------------------------------------
  onProgress?.({ type: "stage", stage: "extracting" });
  let extraction: Extraction = {
    sceneTitle: null,
    location: null,
    memories: [],
    bondMoments: [],
    itemsGained: [],
    deedsDone: [],
    questsOpened: [],
    whatNow: null,
    onTheTable: [],
    // True, like the schema's default and for the same reason: this is the
    // shape used when extraction failed outright, and a turn the game could not
    // read is not one the party should be charged for.
    movedForward: true,
    actComplete: false,
    sceneComplete: false,
  };

  try {
    const result = await requestStructured({
      call: (hint) =>
        calls.json(
          extractionPrompt({
            pacing: input.pacing,
            narration,
            partyNames: input.party.map((member) => member.name),
            openDeeds: input.openDeeds,
          }),
          hint,
        ),
      validate: validator(extractionSchema),
    });
    extraction = result.value;
    diagnostics.extractionRepairs = result.repairs;
  } catch (error) {
    // The story still happened and is still recorded; only the bookkeeping is
    // lost. Losing a memory row is not worth failing the turn over.
    if (!(error instanceof StructuredOutputError)) throw error;
    diagnostics.extractionFellBack = true;
  }

  // Bond moments must be between two different, real party members. A model
  // will occasionally credit someone with helping themselves.
  // Items can only be gained by someone actually present.
  extraction.itemsGained = extraction.itemsGained.filter(
    (item) => findMember(input.party, item.character) !== undefined,
  );

  // A deed can only be one of the ones the party was asked about. With nothing
  // on the board there is nothing it could be reporting, whatever it said.
  if (!input.openDeeds || input.openDeeds.length === 0) extraction.deedsDone = [];

  extraction.bondMoments = extraction.bondMoments.filter((moment) => {
    const from = findMember(input.party, moment.from);
    const to = findMember(input.party, moment.to);
    return from !== undefined && to !== undefined && from.id !== to.id;
  });

  return { adjudication, plans, checks, narration, extraction, diagnostics };
}
