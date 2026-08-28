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
import { signaturesFor } from "@/lib/game/character-options";
import { narrativeHints } from "@/lib/game/knacks";
import { renderKnownPeople, type KnownPerson } from "@/lib/game/acquaintances";
import { dreamNote } from "@/lib/game/dreams";
import { rivalNote } from "@/lib/game/rivals";
import { companionNote } from "@/lib/game/companions";
import { abilityHints } from "@/lib/game/practice";

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
  /** One sentence of manner — who she is, not what she looks like. */
  description?: string | null;
  /**
   * What she looks like, as one sentence from `lookSentence`.
   *
   * Separate from `description` because the two want opposite treatment, and
   * running them together is what broke this. A family wrote a paragraph in the
   * description box and watched the storyteller build every passage around it —
   * correctly, given what it was handed: the most distinctive sentence in the
   * prompt, unlabelled, sitting where a fact about the character goes.
   *
   * So the look is now rendered on its own line, told plainly that it is
   * scenery, and the personality is told plainly that it is not.
   */
  look?: string | null;
  level: number;
  stats: Record<(typeof STATS)[number], number>;
  skills: { name: string; rank: number }[];
  /** Knack keys, for the ones the story itself has to honour. */
  knacks?: string[];
  /**
   * Things she is carrying and cannot use yet, with what she would need.
   *
   * Without this the lock was a label on a sheet and nothing else: the
   * storyteller had no idea the flute was beyond her, so it would cheerfully
   * let her play it next turn and the requirement would mean nothing.
   */
  lockedItems?: { name: string; needs: string }[];
  /**
   * Names of once-a-scene and once-a-chapter abilities she has already spent.
   *
   * Told to the storyteller so it stops offering something she cannot do. A
   * limit only the database knows about produces the worst version of this: the
   * narration invites her to use it, she taps it, and the server quietly drops
   * the spend as unavailable.
   */
  spentAbilities?: string[];
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
  /**
   * What each character is quietly hoping to do this chapter.
   *
   * The storyteller is the only one who sees all of these — that is the whole
   * mechanism. Its job is to leave each of them a door, so that four players at
   * one table are not all pushing on the same one.
   */
  personalAims?: { character: string; aim: string }[];
  /**
   * The long wishes, older than this adventure.
   *
   * Only the ones the world is currently allowed to touch — see `mayEcho`. A
   * dream on cooldown is left out entirely rather than listed with a "not yet",
   * because telling a small model about a thing it must not use is the reliable
   * way to get it used.
   */
  dreams?: { character: string; wish: string }[];
  /**
   * The person who keeps turning up, when this household has one and this
   * chapter has not used them yet.
   *
   * Absent rather than forbidden when the chapter has already had its meeting —
   * the same reasoning as a cooling dream. A model told about somebody it must
   * not use will use them.
   */
  rival?: {
    name: string;
    about: string;
    wants: string;
    partyAhead: number;
    rivalAhead: number;
  } | null;
  /**
   * The small things travelling with them, and who each belongs to.
   *
   * Never filtered or rationed, unlike the dreams and the rival: a companion is
   * present in every scene by definition, and a storyteller that forgets it is
   * there is the failure worth avoiding.
   */
  companions?: { owner: string; name: string; kind: string; knack: string }[];
  /**
   * People this party met on earlier adventures and might run into again.
   *
   * Empty on a family's first story, which is most of them — so this costs
   * nothing until there is a back catalogue to draw on, and then it is the
   * thing that makes the world feel lived in rather than reset.
   */
  knownPeople?: KnownPerson[];
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
    // Two lines, two jobs, and the labels are doing the work. An appearance
    // handed to a storyteller with no stated purpose gets treated as the point
    // of the character; the same words under "what she looks like" get treated
    // as what she looks like.
    const description = member.description ? `\n  Who they are: ${member.description}` : "";
    const look = member.look
      ? `\n  Looks like: ${member.look} Scenery, not plot — mention it only when somebody would actually see it, and never build a scene around it.`
      : "";

    // The one thing this calling alone can do. Named here so the storyteller
    // leaves room for it — a Trickster's "there is always another way" only
    // means anything if the scene has one.
    // "Can always" was a straightforward lie, and the most consequential one
    // in the prompt: signatures have been once-a-scene since they were written,
    // and this line told the only participant who could have enforced that the
    // exact opposite. A storyteller reading "can always" has no reason ever to
    // say no, so the limit could not have held even if somebody had been
    // counting — and nobody was.
    //
    // Plural since a second signature arrives at level 5, and listed one per
    // line from there: two of these run to well over a line each, and a party
    // of four at level five would otherwise be eight sentences run together.
    const spent = new Set(member.spentAbilities ?? []);
    const own = signaturesFor(member.archetype, member.level)
      .map((signature) =>
        spent.has(signature.name)
          ? `\n  Once a scene: ${signature.name} — ALREADY USED this scene; do not offer it again until the next one.`
          : `\n  Once a scene: ${signature.name} — ${signature.narrationHint}`,
      )
      .join("");

    // Knacks the story has to behave differently because of. The ones that are
    // only a number are left out — the dice have already applied those, and
    // repeating them here would just crowd the prompt.
    // Anything spent is dropped rather than annotated: these hints are written
    // as standing instructions to the storyteller ("you must answer honestly"),
    // and a spent one restated with a caveat is an instruction the model has to
    // reason its way out of rather than simply not be given.
    const hints = [...narrativeHints(member.knacks ?? []), ...abilityHints(member.skills)].filter(
      (hint) => ![...spent].some((name) => hint.includes(name)),
    );
    const earned = hints.length > 0 ? `\n  ${hints.join("\n  ")}` : "";

    // What she is carrying but has not grown into. Stated as a prohibition
    // because it is one, and because a requirement nobody enforces is worse
    // than no requirement — it promises a goal and then quietly gives it away.
    const locked =
      (member.lockedItems ?? []).length > 0
        ? `\n  Carries but CANNOT use yet: ${(member.lockedItems ?? [])
            .map((item) => `${item.name} (needs ${item.needs})`)
            .join("; ")}. Do not let them use these, and if they try, say plainly what is missing.`
        : "";

    return (
      `- ${member.name} (${member.pronouns}), ${member.ageBand.toLowerCase()} ${member.race} ` +
      `${member.archetype}, level ${member.level}. ${stats}.${skills}${description}${look}${own}${earned}${locked}`
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
      ? `Things the party should be able to find here. Put each one SOMEWHERE — a place, a ` +
        `person, a container — and leave it there until somebody actually goes and gets it. ` +
        `Mention where it might be; never place it in front of whoever happens to be rolling. ` +
        `Do not hand one over as a reward for a good roll, do not tuck one inside something ` +
        `else as a bonus, and never put the same thing in two places because somebody looked ` +
        `twice. If a party solves this another way, let them:\n${(input.actSeeks ?? [])
          .map((item) => `- ${item}`)
          .join("\n")}`
      : "",
    (input.itemsHeld?.length ?? 0) > 0
      ? `Already found and being carried: ${(input.itemsHeld ?? []).join(", ")}. Do not offer these again.`
      : "",
    // The one part of the context that is per-player rather than per-party.
    // Without it four children take turns nudging the same plot; with it each
    // of them has something only they are looking for.
    (input.personalAims?.length ?? 0) > 0
      ? `WHAT EACH OF THEM QUIETLY WANTS. Only you know these. Over this chapter, give ` +
        `each character ONE opening to act on theirs — a person to talk to, a thing ` +
        `to notice, a moment where it would be natural. One opening, not one per turn: an ` +
        `aim the world keeps offering is an aim nobody achieved. Never announce them, never ` +
        `have a character state theirs aloud, and never make one of them the thing the party ` +
        `must do next:\n${(input.personalAims ?? [])
          .map((entry) => `- ${entry.character}: ${entry.aim}`)
          .join("\n")}`
      : "",
    // Placed straight after the personal aims, because the two are the same
    // shape of secret and the difference between them matters: an aim is for
    // this chapter and wants an opening, a dream is for the year and wants
    // almost nothing. Reading them side by side is what keeps the second from
    // being played like the first.
    dreamNote(
      (input.dreams ?? []).map((entry) => ({
        characterName: entry.character,
        wish: entry.wish,
        lastEchoTurn: null,
      })),
    ),
    // Offered rather than required. A chapter bent around an old acquaintance
    // because the prompt insisted is worse than one that never mentions them.
    renderKnownPeople(input.knownPeople ?? []),
    // Beside the people they know, because that is what this is — one of them,
    // with a running score attached and a great deal more said about what they
    // are not allowed to be.
    input.rival ? rivalNote(input.rival) : "",
    companionNote(input.companions ?? []),
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
