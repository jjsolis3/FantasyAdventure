/**
 * Assembling what the Game Master is allowed to know.
 *
 * A local model cannot be handed twenty sessions of transcript, so context is
 * built as a pyramid and trimmed from the bottom when it exceeds budget:
 *
 *   1. Campaign bible     — premise and the current act's goal
 *   2. Party sheet        — who is here, their stats and bonds
 *   3. Where and when     — location and the current scene's summary
 *   4. Long-term memory   — ranked facts, NPCs, places, plot threads
 *   5. Recent turns       — verbatim, most recent first to survive trimming
 *
 * Pure data in, string out. No database access, so it can be tested directly.
 */

import { STAT_INFO, STATS, RELATIONSHIP_LABELS, type RelationshipKind } from "@/lib/game/rules";

/** Rough token estimate. Four characters per token is close enough for
 *  budgeting and costs nothing; being exact would need a tokenizer per model. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type PartyMemberContext = {
  name: string;
  race: string;
  archetype: string;
  pronouns: string;
  ageBand: string;
  description?: string | null;
  level: number;
  stats: Record<(typeof STATS)[number], number>;
  skills: { name: string; rank: number }[];
};

export type BondContext = {
  from: string;
  to: string;
  kind: RelationshipKind;
  level: number;
};

export type MemoryContext = {
  kind: string;
  key: string;
  content: string;
  importance: number;
  lastSeenAt: number;
};

export type TurnContext = {
  type: "NARRATION" | "PLAYER_ACTION" | "DICE_ROLL" | "SYSTEM";
  actor?: string | null;
  content: string;
};

export type ContextInput = {
  campaignTitle: string;
  storylineTitle: string;
  premise: string;
  actTitle: string;
  actGoal: string;
  actBeats: string[];
  /**
   * What this chapter wants the party to come away holding, and what they are
   * already carrying so that nothing is handed over twice.
   *
   * Optional because not every caller has a campaign behind it — the settings
   * page's practice turn and the CLI harness both build a context out of thin
   * air, and neither has an inventory to speak of.
   */
  actSeeks?: string[];
  itemsHeld?: string[];
  party: PartyMemberContext[];
  bonds: BondContext[];
  location?: string | null;
  sceneSummary?: string | null;
  /** Summaries of scenes already closed, oldest first. */
  priorScenes: string[];
  memories: MemoryContext[];
  /** Oldest first. Trimmed from the front when space runs short. */
  recentTurns: TurnContext[];
  currentTurnCounter: number;
  maxTokens: number;
};

function renderParty(party: PartyMemberContext[], bonds: BondContext[]): string {
  const lines = party.map((member) => {
    const stats = STATS.map((stat) => `${STAT_INFO[stat].label} ${member.stats[stat]}`).join(", ");
    const skills =
      member.skills.length > 0
        ? ` Good at: ${member.skills.map((skill) => `${skill.name} ${skill.rank}`).join(", ")}.`
        : "";
    const description = member.description ? ` ${member.description}` : "";

    return (
      `- ${member.name} (${member.pronouns}), ${member.ageBand.toLowerCase()} ${member.race} ` +
      `${member.archetype}, level ${member.level}. ${stats}.${skills}${description}`
    );
  });

  if (bonds.length > 0) {
    lines.push("Family:");
    for (const bond of bonds) {
      lines.push(
        `- ${bond.from} is the ${RELATIONSHIP_LABELS[bond.kind]} ${bond.to}` +
          (bond.level > 0 ? ` (bond ${bond.level})` : ""),
      );
    }
  }

  return lines.join("\n");
}

/**
 * Ranks memories by importance first, then by how recently they came up.
 *
 * A central plot thread mentioned ten turns ago should still outrank a
 * incidental detail from last turn, which straight recency would get wrong.
 */
export function rankMemories(memories: MemoryContext[], currentTurn: number): MemoryContext[] {
  return [...memories].sort((a, b) => {
    const scoreA = a.importance * 10 - Math.min(currentTurn - a.lastSeenAt, 20);
    const scoreB = b.importance * 10 - Math.min(currentTurn - b.lastSeenAt, 20);
    return scoreB - scoreA;
  });
}

function renderTurn(turn: TurnContext): string {
  switch (turn.type) {
    case "PLAYER_ACTION":
      return `${turn.actor ?? "Someone"}: ${turn.content}`;
    case "DICE_ROLL":
      return `[${turn.content}]`;
    case "SYSTEM":
      return `[${turn.content}]`;
    default:
      return turn.content;
  }
}

export type BuiltContext = {
  text: string;
  estimatedTokens: number;
  /** What had to be dropped to fit, for the debug log. */
  trimmed: { memories: number; turns: number; priorScenes: number };
};

export function buildContext(input: ContextInput): BuiltContext {
  const trimmed = { memories: 0, turns: 0, priorScenes: 0 };

  // Layers 1-3 are never dropped: without them the Game Master does not know
  // what story it is telling or who is in the room.
  const header = [
    `ADVENTURE: ${input.campaignTitle} (${input.storylineTitle})`,
    input.premise,
    "",
    `CURRENT CHAPTER: ${input.actTitle}`,
    `What this chapter is about: ${input.actGoal}`,
    input.actBeats.length > 0
      ? `Things that could happen (optional, ignore if the party goes elsewhere):\n${input.actBeats
          .map((beat) => `- ${beat}`)
          .join("\n")}`
      : "",
    // Named separately from the beats because they are the one kind of guidance
    // the table can see for itself — a screen tells them what is still missing,
    // so the storyteller has to make these findable rather than merely possible.
    (input.actSeeks?.length ?? 0) > 0
      ? `Things the party should be able to find here. Make them findable — put them somewhere a ` +
        `search, a question or a kindness would turn them up — but never force them into anybody's ` +
        `hands, and let a party that solves this another way carry on:\n${(input.actSeeks ?? [])
          .map((item) => `- ${item}`)
          .join("\n")}`
      : "",
    (input.itemsHeld?.length ?? 0) > 0
      ? `Already found and being carried: ${(input.itemsHeld ?? []).join(", ")}. Do not offer these again.`
      : "",
    "",
    "THE PARTY:",
    renderParty(input.party, input.bonds),
    "",
    input.location ? `WHERE THEY ARE: ${input.location}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fixedTokens = estimateTokens(header);
  let budget = input.maxTokens - fixedTokens;

  // Layer 3b: the current scene so far.
  const sceneBlock = input.sceneSummary ? `\nSO FAR IN THIS SCENE:\n${input.sceneSummary}` : "";
  budget -= estimateTokens(sceneBlock);

  // Layer 4: ranked memories, taken until the allowance runs out. Capped at a
  // third of the remaining budget so recent turns are never starved out.
  const memoryAllowance = Math.max(0, Math.floor(budget / 3));
  const ranked = rankMemories(input.memories, input.currentTurnCounter);
  const keptMemories: string[] = [];
  let memoryTokens = 0;

  for (const memory of ranked) {
    const line = `- (${memory.kind.toLowerCase()}) ${memory.key}: ${memory.content}`;
    const cost = estimateTokens(line);
    if (memoryTokens + cost > memoryAllowance) {
      trimmed.memories = ranked.length - keptMemories.length;
      break;
    }
    keptMemories.push(line);
    memoryTokens += cost;
  }
  budget -= memoryTokens;

  // Layer 4b: earlier scene summaries, newest first — old chapters matter less
  // than the one just finished.
  const keptScenes: string[] = [];
  let sceneTokens = 0;
  const sceneAllowance = Math.max(0, Math.floor(budget / 4));

  for (const summary of [...input.priorScenes].reverse()) {
    const cost = estimateTokens(summary);
    if (sceneTokens + cost > sceneAllowance) {
      trimmed.priorScenes = input.priorScenes.length - keptScenes.length;
      break;
    }
    keptScenes.unshift(summary);
    sceneTokens += cost;
  }
  budget -= sceneTokens;

  // Layer 5: recent turns, taken newest-first so that what just happened
  // always survives, then re-ordered for reading.
  const keptTurns: string[] = [];
  let turnTokens = 0;

  for (const turn of [...input.recentTurns].reverse()) {
    const line = renderTurn(turn);
    const cost = estimateTokens(line);
    if (turnTokens + cost > budget) {
      trimmed.turns = input.recentTurns.length - keptTurns.length;
      break;
    }
    keptTurns.unshift(line);
    turnTokens += cost;
  }

  const text = [
    header,
    keptScenes.length > 0 ? `\nEARLIER:\n${keptScenes.join("\n")}` : "",
    keptMemories.length > 0 ? `\nWHAT YOU REMEMBER:\n${keptMemories.join("\n")}` : "",
    sceneBlock,
    keptTurns.length > 0 ? `\nJUST NOW:\n${keptTurns.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { text, estimatedTokens: estimateTokens(text), trimmed };
}
