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
import type { StatKey } from "@/lib/game/rules";

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
  /** Set when player input tripped the safety screen. */
  deflectionNote?: string | null;
};

/** Injected so the pipeline can be tested without a model server. */
export type ModelCalls = {
  json: (prompt: string, repairHint: string | null) => Promise<string>;
  prose: (system: string, prompt: string) => Promise<string>;
};

/** Emitted as the pipeline advances, so a slow turn does not look like a hang. */
export type TurnProgress =
  | { type: "stage"; stage: "adjudicating" | "rolling" | "narrating" | "extracting" }
  | { type: "dice"; checks: CheckResult[] };

export type TurnResult = {
  adjudication: Adjudication;
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
  onProgress?.({ type: "stage", stage: "adjudicating" });
  let adjudication: Adjudication = { checks: [], automatic: [] };
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
    };
  }

  // ---- 2. Roll -------------------------------------------------------------
  onProgress?.({ type: "stage", stage: "rolling" });
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

    checks.push(resolveCheck(request, member.stats, roller, move));
  }

  // The dice go out before the narration is written. On a local model that
  // wait is 20-40 seconds, and watching the rolls land is the fun part anyway.
  onProgress?.({ type: "dice", checks });

  // ---- 3. Narrate ----------------------------------------------------------
  onProgress?.({ type: "stage", stage: "narrating" });
  const resolutions = [
    ...checks.map(describeResult),
    ...adjudication.automatic.map((entry) => `${entry.character}: ${entry.effect} (happens automatically)`),
  ].join("\n\n");

  const system = systemPrompt({ tone: input.tone, readingLevel: input.readingLevel });
  const basePrompt = narrationPrompt({
      correction: input.correction,
    context: input.context,
    actions: namedActions,
    resolutions: resolutions || "Nothing needed a dice roll this turn.",
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

  return { adjudication, checks, narration, extraction, diagnostics };
}
