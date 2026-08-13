/**
 * The Game Master's instructions.
 *
 * Written for small local models, which means: short imperative rules, no
 * nested conditionals, concrete examples over abstract principles, and the
 * most important constraint stated first and last. A 7B model reads the top
 * and bottom of a system prompt far more reliably than the middle.
 */

import { STAT_INFO, STATS, type StatKey } from "@/lib/game/rules";

export type ToneKey = "COZY" | "ADVENTUROUS" | "SPOOKY";
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
  // Sharpened for game-night energy: the families who pick this tone are
  // sitting around a table wanting laughter and cliffhangers, not a wind-down.
  // A ten-year-old who plays survival games does not need the evening padded.
  ADVENTUROUS:
    "Real tension is welcome. Things can be eerie, urgent, and genuinely uncertain, and a " +
    "clock can be ticking. Something can be behind the door. End scenes on the discovery, " +
    "the complication, or the door swinging open — never on things settling down. It is " +
    "never something that wants to hurt them.",
  // Written to be genuinely frightening, because a table that asked for
  // frightening and got "slightly odd" will stop asking. The fear is built out
  // of wrongness, being watched and not being believed — the Goosebumps and
  // Stranger Things toolkit — rather than out of harm, which the core contract
  // forbids and which is the least interesting way to frighten anybody.
  SPOOKY:
    "Frighten them properly. Build dread: something is wrong and everyone can feel it before " +
    "anyone can name it. Use the specific and the ordinary — a door that is open by one inch " +
    "more than it was, a reflection a beat behind, a voice that knows their names. Things can " +
    "follow, watch, wait at the edge of the light, and copy them badly. Grown-ups do not " +
    "believe them yet. " +
    "Let the fear land: do not undercut a frightening moment with a joke or a reassurance in " +
    "the same breath. " +
    "What is never in doubt is that they are not going to be hurt. Nothing draws blood, " +
    "nothing catches them, nobody is taken. A chase ends in a hiding place or a slammed door, " +
    "never in being caught. Whatever it is turns out to want something — and wanting is what " +
    "makes it possible to talk to, trick, feed, free or forgive. " +
    "End every scene with a way forward, even a narrow one, and never leave a character alone " +
    "in the dark at the end of a turn.",
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
- Never write dialogue or decisions for the players' characters. They speak for themselves.
- Give every named character a want and a voice. Let them be funny, stubborn, dramatic, suspicious — never furniture.
- A failed roll never stops the story. It complicates it: the ladder holds but the chickens scream, the lie works on the wrong person.
- End every turn on something moving — a discovery, a complication, a choice with teeth.`;

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

/**
 * The stats, one per line, with the moment each is *for*.
 *
 * Four stats fitted comfortably on one comma-separated line. Seven do not, and
 * a small local model asked to choose one of seven from a run-on sentence will
 * reach for whichever it read last. So they are listed, and each carries a
 * "pick this when" — the blurb says what the stat *is*, which is written for a
 * child reading her sheet, and the adjudicator needs to know when to reach for
 * it instead.
 *
 * Grace, Luck and Grit get the most attention here because they are the newest
 * and the least obvious. Luck especially: it is the only one that is not about
 * what the character does well, but about whether the world happens to oblige.
 */
const PICK_WHEN: Record<StatKey, string> = {
  might: "shifting, lifting, forcing or breaking something",
  wits: "working something out, spotting it, or remembering it",
  heart: "reaching another person or creature — comforting, persuading, standing up for them",
  spark: "anything strange, magical, or addressed to something that should not answer",
  grace: "staying quiet, keeping your footing, catching it, threading it, slipping past",
  luck: "the question is whether the thing is there at all — rummaging, guessing which way, hoping the shortcut works",
  grit: "the difficulty is lasting: holding on, keeping going, refusing to be frightened off",
};

const STAT_LIST = STATS.map(
  (stat) => `- ${stat}: ${STAT_INFO[stat].blurb} Pick it when ${PICK_WHEN[stat]}.`,
).join("\n");

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

Choose exactly one stat for each roll:
${STAT_LIST}

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
  "checks": [{"character": "<name>", "stat": "<one of ${STATS.join("|")}>", "difficulty": "EASY|NORMAL|HARD", "intent": "<what they are attempting>", "practice": "<one word for the kind of thing>"}],
  "automatic": [{"character": "<name>", "effect": "<what simply happens>"}]
}

Every character must appear in exactly one of the two lists.

"practice" is the KIND of thing being attempted, not this particular attempt:
"climbing", "persuading", "sneaking", "listening", "mending", "swimming". One
word, a plain everyday one, and the SAME word every time that kind of thing
comes up — it is how a character slowly gets good at what she keeps doing.`;
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
export function extractionPrompt(options: {
  narration: string;
  partyNames: string[];
  /**
   * Where the story is and how long this family likes an act to run.
   *
   * Without it the storyteller judged "actComplete" from the passage alone,
   * with no idea whether the table wanted an evening or a month — so
   * adventures ran whatever length the model felt like.
   */
  pacing?: string;
  /**
   * Objectives currently on the board that are not about carrying something.
   *
   * Given so that "deedsDone" can be matched rather than invented: the model is
   * asked which of *these* happened, not what the party achieved in general.
   * Finds need no such list — they are settled by looking in people's pockets.
   */
  openDeeds?: string[];
}): string {
  const deeds = options.openDeeds?.length
    ? `\nTHINGS THE PARTY IS CURRENTLY TRYING TO DO:\n${options.openDeeds.map((deed) => `- ${deed}`).join("\n")}\n`
    : "";

  return `Read this passage from a story and extract what should be remembered.

PASSAGE:
${options.narration}

The characters in the party are: ${options.partyNames.join(", ")}.
${deeds}
Reply with ONLY this JSON, no other text:
{
  "sceneTitle": "<short title, or null if unchanged>",
  "location": "<where they are now, or null if unchanged>",
  "memories": [{"kind": "FACT|NPC|PLACE|PLOT_THREAD", "key": "<short handle>", "content": "<one sentence>", "importance": 1-5}],
  "bondMoments": [{"from": "<character>", "to": "<character>", "why": "<what they did for them>"}],
  "itemsGained": [{"character": "<character>", "name": "<item>", "description": "<one short phrase>", "requiresSkill": null, "requiresRank": null}],
  "deedsDone": ["<one of the listed things, if the passage shows it finished>"],
  "questsOpened": [{"title": "<short name>", "summary": "<one line>", "objectives": [{"kind": "FIND|DEED", "text": "<what it needs>"}]}],
  "whatNow": "<one short question putting the choice back to the players>",
  "actComplete": false,
  "sceneComplete": false
}
${options.pacing ? `\nHOW LONG THIS SHOULD RUN:\n${options.pacing}\n` : ""}
Set "sceneComplete" when the party has clearly moved on — somewhere new, or a
situation that is finished. Set "actComplete" only when the act's own goal is
met, not merely because a scene ended.

Rules:
- Only record things that will still matter in an hour. Skip scenery.
- bondMoments are ONLY between two characters in the party list above, and only
  when one genuinely helped, protected, encouraged or comforted the other.
- sceneComplete is true only if the party has moved somewhere new or time has jumped.
- itemsGained is ONLY for objects a character is now carrying. Not scenery, not
  things they merely looked at.
- requiresSkill is for the rare object somebody is not ready for — a flute they
  cannot play, a book they cannot read. Name a skill and a rank from 1 to 4.
  They still carry it; they just cannot use it yet, and that gives them
  something to grow toward. Leave both null for almost everything.
- deedsDone may ONLY contain things from the list above, and only when the
  passage shows them actually finished. Do not invent entries. Usually [].
- questsOpened is for a NEW errand the passage introduced that the party could
  choose to take on — a neighbour's missing cat, a promise made, a debt owed.
  Only when it is a real, findable thing somebody asked for. Never restate what
  the party is already doing, and never open one just to have something to say:
  most turns start nothing, and [] is the right answer.
- whatNow is one short question handing the moment back to the players, in the
  voice of somebody running the game: "The door is open an inch. Do you go in?"
  Point at something the passage actually put in front of them. Never suggest
  what they should do, never offer a menu of options, and never ask more than
  one thing. Under fifteen words.
- Use [] for empty lists, never null.`;
}

/**
 * The opening passage's version of "what now".
 *
 * Its own call because the opening runs no extraction — nothing has happened
 * yet for there to be memories or deeds of. Kept as short as a prompt can be:
 * this is one sentence, and a small model given room will write a paragraph.
 */
export function nudgePrompt(options: { narration: string; partyNames: string[] }): string {
  return `Read this opening passage from a family adventure.

PASSAGE:
${options.narration}

The players are: ${options.partyNames.join(", ")}.

Reply with ONLY this JSON, no other text:
{"whatNow": "<one short question>"}

The question hands the moment back to the players, in the voice of somebody
running the game: "The door is open an inch. Do you go in?" Point at something
the passage actually put in front of them. Do not suggest what they should do,
do not offer a menu of options, and do not ask more than one thing. Under
fifteen words.`;
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
 * One aim per character for the chapter ahead.
 *
 * Run once when a chapter opens rather than every turn, which keeps it to a
 * handful of calls an adventure. Each character is named in the request and
 * required in the reply, because a storyteller asked to "give everyone
 * something personal" hands the bold one three threads and the quiet one none —
 * and the quiet one is exactly who this feature is for.
 *
 * The aims lean on the character rather than the plot on purpose. "Find out
 * what the miller is hiding" is just the main quest again, wearing a hat. "Get
 * the goat to like you" is hers.
 */
export function personalQuestsPrompt(options: {
  context: string;
  actTitle: string;
  party: { name: string; archetype: string; description: string | null }[];
}): string {
  const who = options.party
    .map(
      (member) =>
        `- ${member.name}, ${member.archetype}${member.description ? `. ${member.description}` : ""}`,
    )
    .join("\n");

  return `${options.context}

The chapter beginning is called "${options.actTitle}".

Give each of these characters ONE small aim of their own for this chapter:

${who}

Reply with ONLY this JSON, no other text:
{
  "aims": [{"character": "<name>", "title": "<short name for it>", "summary": "<one line, spoken to them>", "objective": {"kind": "FIND|DEED", "text": "<the one thing that finishes it>"}}]
}

Rules:
- One aim for EVERY character listed, no more and no less.
- It must come from who they are — their calling, what they are like — and not
  from the plot. If an aim would still make sense handed to a different
  character, it is the wrong aim.
- Small enough to finish in one chapter, and possible in the place they are.
  Something they could do this evening, not a life ambition.
- Nothing that requires another character to fail, lose something, or be kept in
  the dark. These run alongside the story, never against each other.
- Write the summary TO them: "See if you can get the miller's dog to trust you."
- kind is FIND only if it is finished by carrying an object. Otherwise DEED.`;
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
