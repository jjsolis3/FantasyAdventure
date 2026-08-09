/**
 * The Game Master's instructions.
 *
 * Written for small local models, which means: short imperative rules, no
 * nested conditionals, concrete examples over abstract principles, and the
 * most important constraint stated first and last. A 7B model reads the top
 * and bottom of a system prompt far more reliably than the middle.
 */

import { STAT_INFO, STATS } from "@/lib/game/rules";

export type ToneKey = "COZY" | "ADVENTUROUS";
export type ReadingLevelKey = "EARLY_READER" | "MIDDLE_GRADE" | "TEEN" | "FAMILY_MIXED";

const READING_LEVEL_GUIDANCE: Record<ReadingLevelKey, string> = {
  EARLY_READER:
    "Write for a 6-year-old. Short sentences. Everyday words. One idea per sentence. " +
    "Around 80-120 words per turn.",
  MIDDLE_GRADE:
    "Write for a 10-year-old who reads Harry Potter and Wings of Fire. Real sentences with " +
    "rhythm, vivid concrete detail, and the occasional word they will have to work out from " +
    "context. Do not talk down to them. Around 120-180 words per turn.",
  TEEN:
    "Write for a 14-year-old. Layered sentences, dry humour, subtext the reader can catch. " +
    "Around 150-220 words per turn.",
  FAMILY_MIXED:
    "Write so the youngest at the table follows every sentence, but leave one image or joke " +
    "per turn that the oldest will enjoy more. Around 120-180 words per turn.",
};

const TONE_GUIDANCE: Record<ToneKey, string> = {
  COZY:
    "Keep the stakes small and warm. Setbacks are inconveniences — a dropped basket, a " +
    "sulking goat — never threats. Nothing lurks.",
  ADVENTUROUS:
    "Real tension is welcome. Things can be eerie, urgent, and genuinely uncertain. " +
    "Something can be behind the door. It is never something that wants to hurt them.",
};

/** The rules that never change, whatever the campaign settings. */
const CORE_CONTRACT = `You are the Game Master of a family storytelling game.

THE MOST IMPORTANT RULES:
1. Nobody dies. Nobody is seriously hurt. No blood, no gore, no cruelty.
2. Problems are solved by kindness, cleverness and courage — never by violence.
3. Monsters are misunderstood, lonely, frightened or hungry. They get befriended, calmed or fed.
4. Never refuse a player's idea. If it is silly, let it work in a silly way.
5. You never decide whether an action succeeds. You will be TOLD the dice result. Narrate what you are told.

HOW TO WRITE:
- Second person, present tense. "You push open the gate."
- Address characters by name. Give every character something to do or notice.
- End by describing the situation, never by asking "what do you do?" — the game asks that.
- Show, do not explain. No summarising what just happened.
- Never write dialogue or decisions for the players' characters. They speak for themselves.`;

export function systemPrompt(options: {
  tone: ToneKey;
  readingLevel: ReadingLevelKey;
}): string {
  return [
    CORE_CONTRACT,
    "",
    `TONE: ${TONE_GUIDANCE[options.tone]}`,
    `AUDIENCE: ${READING_LEVEL_GUIDANCE[options.readingLevel]}`,
    "",
    "Remember: nobody dies, nothing is cruel, and you narrate the dice result you are given.",
  ].join("\n");
}

const STAT_LIST = STATS.map((stat) => `${stat} (${STAT_INFO[stat].blurb})`).join(", ");

/** Stage 1 — decide which declared actions need a roll. */
/**
 * The table's own words about what the last telling misunderstood.
 *
 * Placed high, before the actions, because it exists to change how those
 * actions are read — arriving after them would be a footnote to a
 * misreading that has already happened.
 */
function correctionBlock(correction?: string): string {
  if (!correction?.trim()) return "";
  return `
THE TABLE SAYS THE LAST TELLING GOT SOMETHING WRONG:
${correction.trim()}

Take that as the truth of what happened and tell it again accordingly.
`;
}

export function adjudicationPrompt(options: {
  sceneText: string;
  party: string;
  actions: { character: string; text: string }[];
  /** The table saying what the previous telling got wrong. */
  correction?: string;
}): string {
  return `Read what each character is trying to do and decide which attempts need a dice roll.

Needs a roll: anything uncertain, risky, or that could fail interestingly.
Does NOT need a roll: talking, walking, looking around, picking something up, anything certain.

Stats: ${STAT_LIST}
Difficulty: EASY for simple-but-uncertain, NORMAL for genuinely tricky, HARD for a long shot.

THE SCENE:
${options.sceneText}
${correctionBlock(options.correction)}
THE PARTY:
${options.party}

WHAT THEY ARE DOING:
${options.actions.map((action) => `- ${action.character}: ${action.text}`).join("\n")}

Reply with ONLY this JSON, no other text:
{
  "checks": [{"character": "<name>", "stat": "<one of ${STATS.join("|")}>", "difficulty": "EASY|NORMAL|HARD", "intent": "<what they are attempting>"}],
  "automatic": [{"character": "<name>", "effect": "<what simply happens>"}]
}

Every character must appear in exactly one of the two lists.`;
}

/** Stage 3 — narrate, given the dice results. */
export function narrationPrompt(options: {
  context: string;
  actions: { character: string; text: string }[];
  resolutions: string;
  /** The table saying what the previous telling got wrong. */
  correction?: string;
}): string {
  return `${options.context}
${correctionBlock(options.correction)}
WHAT THE CHARACTERS JUST DID:
${options.actions.map((action) => `- ${action.character}: ${action.text}`).join("\n")}

WHAT THE DICE DECIDED (you must narrate these outcomes exactly as given):
${options.resolutions}

Narrate what happens next. Cover every character's action. Honour each dice
outcome above — a COMPLICATION must genuinely not work, a CRITICAL must go
better than expected. End with the party facing a new situation.

Write only the story. No headings, no lists, no questions to the players.`;
}

/** Stage 4 — pull structured state out of the narration just written. */
export function extractionPrompt(options: { narration: string; partyNames: string[] }): string {
  return `Read this passage from a story and extract what should be remembered.

PASSAGE:
${options.narration}

The characters in the party are: ${options.partyNames.join(", ")}.

Reply with ONLY this JSON, no other text:
{
  "sceneTitle": "<short title, or null if unchanged>",
  "location": "<where they are now, or null if unchanged>",
  "memories": [{"kind": "FACT|NPC|PLACE|PLOT_THREAD", "key": "<short handle>", "content": "<one sentence>", "importance": 1-5}],
  "bondMoments": [{"from": "<character>", "to": "<character>", "why": "<what they did for them>"}],
  "itemsGained": [{"character": "<character>", "name": "<item>", "description": "<one short phrase>"}],
  "actComplete": false,
  "sceneComplete": false
}

Rules:
- Only record things that will still matter in an hour. Skip scenery.
- bondMoments are ONLY between two characters in the party list above, and only
  when one genuinely helped, protected, encouraged or comforted the other.
- sceneComplete is true only if the party has moved somewhere new or time has jumped.
- itemsGained is ONLY for objects a character is now carrying. Not scenery, not
  things they merely looked at.
- Use [] for empty lists, never null.`;
}

/** Produced when a scene closes, so its turns can be dropped from the prompt. */
export function summaryPrompt(options: { sceneTitle: string; transcript: string }): string {
  return `Summarise this scene from a family adventure in 3-5 sentences.

Keep: what the party decided, who they met, what changed, anything unresolved.
Drop: descriptions, dialogue, dice results.

SCENE: ${options.sceneTitle}

${options.transcript}

Reply with ONLY this JSON:
{"summary": "<3-5 sentences>"}`;
}

/** The first scene of a campaign, narrated from the storyline's hook. */
export function openingPrompt(options: { context: string; hook: string }): string {
  return `${options.context}

This is the very first scene. Open the adventure from this situation:

${options.hook}

Set the scene, introduce what the party can see and hear, and give them
something to react to. Name each character at least once so everyone knows they
are here. End with the party facing the situation — do not ask what they do.

Write only the story.`;
}

/**
 * A turn where the party talks rather than acts.
 *
 * No dice, no consequences, no act progress — the storyteller listens and the
 * world responds. This exists because the best part of a tabletop game is two
 * children planning together, and a loop that only ever asks "what do you do?"
 * quietly teaches them that talking is not a move.
 */
export function conversationPrompt(options: {
  context: string;
  said: { character: string; text: string }[];
}): string {
  return `${options.context}

WHAT THE CHARACTERS SAY TO EACH OTHER:
${options.said.map((line) => `- ${line.character}: ${line.text}`).join("\n")}

Respond to this conversation. Nothing is being attempted yet, so nothing
succeeds or fails — do not invent an outcome, and do not move the story on.

You may: have someone present react, add a sound or a detail that answers what
they wondered about, or let a character notice something while they talk. Keep
it short — a paragraph at most. Leave them exactly where they are, still free
to decide what to do.

Write only the story. No headings, no lists, no questions to the players.`;
}

/**
 * Three things a character might try, for a player who has gone blank.
 *
 * Deliberately grounded in the scene and in who this character is, because a
 * generic list ("attack it", "run away") teaches nothing and fits no story.
 */
export function suggestionPrompt(options: {
  sceneText: string;
  characterName: string;
  characterSummary: string;
}): string {
  return `A player is stuck and would like some ideas.

THE SCENE:
${options.sceneText}

THE CHARACTER:
${options.characterName} — ${options.characterSummary}

Suggest three different things ${options.characterName} could try. Make them
genuinely different from each other: one careful, one bold, one kind or
curious. Each must fit this scene and suit this character.

Write each as ${options.characterName} would say it, in the first person, in
under fifteen words. No numbering, no explanation.

Reply with JSON only:
{"suggestions": ["...", "...", "..."]}`;
}
