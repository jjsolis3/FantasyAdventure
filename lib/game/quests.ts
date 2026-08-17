/**
 * Quests: what the party is trying to do, and the moment they finish it.
 *
 * The storyline could already name things a chapter wanted the party to come
 * away holding, and a page could already work out which of them were in
 * somebody's pocket. What none of it had was an ending. Finding the last thing
 * on the list changed nothing, said nothing, and cost nothing — the list simply
 * went quiet. This is the part that was missing.
 *
 * Two ideas do most of the work:
 *
 * **A FIND resolves itself.** An objective asking for the brass key is met when
 * somebody in the party is carrying something that looks like a brass key. No
 * model call, no bookkeeping, nothing for the storyteller to forget. The match
 * is forgiving for the reason it always was: the chapter says "the brass key"
 * and the scene says "a small brass key, green at the teeth".
 *
 * **Finishing spends what it took.** A key handed over to open a door is gone,
 * which is what makes carrying it mean anything. But an item that silently
 * disappeared off a child's sheet would read as a punishment for having found
 * it, so it leaves the pack and becomes a keepsake naming what it bought.
 */

import type { Prisma, QuestKind } from "@/generated/prisma/client.ts";
import { looksLikeTheSameThing, whatWouldCount } from "@/lib/game/finds";
import { QUEST_XP, levelReached } from "@/lib/game/rules";
import { pronounsOf } from "@/lib/game/pronouns";

/** The transaction handle the turn pipeline hands around. */
type Tx = Prisma.TransactionClient;

export type ObjectiveLike = {
  id: string;
  kind: "FIND" | "DEED";
  text: string;
  position: number;
  doneAtTurn: number | null;
};

export type CarriedLike = {
  name: string;
  holderId: string;
  holderName: string;
};

export type FindResolution = {
  objectiveId: string;
  itemName: string;
  foundByCharacterId: string;
  foundByName: string;
};

/**
 * Which unmet FIND objectives the party's pockets now satisfy.
 *
 * Each carried item is claimed by at most one objective, in the order the
 * chapter listed them. A chapter that asks for "a key" and "the brass key"
 * would otherwise have both ticked off by one key, and report itself finished
 * on half the work.
 */
export function resolveFinds(
  objectives: ObjectiveLike[],
  carried: CarriedLike[],
): FindResolution[] {
  const claimed = new Set<number>();
  const resolutions: FindResolution[] = [];

  const open = objectives
    .filter((objective) => objective.kind === "FIND" && objective.doneAtTurn === null)
    .sort((a, b) => a.position - b.position);

  for (const objective of open) {
    const index = carried.findIndex(
      (item, at) => !claimed.has(at) && looksLikeTheSameThing(objective.text, item.name),
    );
    if (index === -1) continue;

    claimed.add(index);
    resolutions.push({
      objectiveId: objective.id,
      itemName: carried[index].name,
      foundByCharacterId: carried[index].holderId,
      foundByName: carried[index].holderName,
    });
  }

  return resolutions;
}

/**
 * Which unmet objectives the storyteller says were accomplished.
 *
 * Matched forgivingly against what it reported, for the same reason finds are:
 * the model is describing what happened in its own words, not quoting the
 * objective back. Each report satisfies at most one objective.
 *
 * ## Why this is no longer DEEDs only
 *
 * It was, and the reasoning sounded right: a FIND settles itself by looking in
 * people's pockets, so nobody needs to ask the storyteller about it. The hole
 * in that cost a family a whole evening.
 *
 * Chapter one of *The Village That Built Itself* asks for **"the first thing you
 * made, awake now and following you about"**. In play that turned out to be a
 * wooden owl called Woody, who rides on a child's shoulder. A companion is not
 * an `InventoryItem` and should never become one — putting a pet in a pocket to
 * satisfy a matcher is the tail wagging the dog — so the chapter's only
 * objective was unsatisfiable by construction. Sixteen turns in one chapter,
 * and nothing anybody could have typed would have moved it.
 *
 * The pockets are still the first answer, and for an ordinary object they are
 * the better one: they need no model call and cannot be talked into anything.
 * This is the second answer, for the objectives that are true in the story and
 * cannot be true in an inventory.
 *
 * What keeps it honest is that the model does not get to invent one. It is
 * handed the list of what is outstanding and may only report that one of *those*
 * happened — see `openDeeds` in `extractionPrompt`.
 */
export function resolveDeeds(objectives: ObjectiveLike[], reported: string[]): string[] {
  const done = new Set<string>();

  for (const claim of reported) {
    const match = objectives.find(
      (objective) =>
        objective.doneAtTurn === null &&
        !done.has(objective.id) &&
        looksLikeTheSameThing(objective.text, claim),
    );
    if (match) done.add(match.id);
  }

  return [...done];
}

/**
 * "the brass key", "the brass key and the lantern", "a, b and c".
 *
 * Switches to semicolons when any of the things has a comma inside it, because
 * commas are how the good names are written — "the bell-rope, long enough for
 * two pairs of hands" says what it is and why it matters in one breath. Joined
 * with commas as well, that sentence reads as four things rather than two, and
 * the join lands in the middle of a phrase:
 *
 *   ✗ the bell-rope, long enough for two pairs of hands and the list of
 *     names, read all the way to the end
 *   ✓ the bell-rope, long enough for two pairs of hands; and the list of
 *     names, read all the way to the end
 *
 * Families write their own adventures in the app, and will use commas without
 * being told not to, so this is fixed here rather than by writing flatter names.
 */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";

  const crowded = names.some((name) => name.includes(","));
  const separator = crowded ? "; " : ", ";
  const final = crowded ? "; and " : " and ";

  return `${names.slice(0, -1).join(separator)}${final}${names[names.length - 1]}`;
}

/**
 * Separators that only ever join two instructions, never one phrase.
 *
 * These are safe to split on unconditionally: nothing anybody would name a
 * single object contains "and then".
 */
const STRONG_JOINS = [
  " and then ",
  ", then ",
  " and afterwards ",
  " and finally ",
  " and successfully ",
  " and after that ",
];

/**
 * Words that mark the second half of a plain "and" as its own instruction.
 *
 * A short list on purpose. "a needle and thread" must never become two
 * objectives, and the way to guarantee that is to split on a bare "and" only
 * when what follows reads as a thing to *do*.
 */
const IMPERATIVES = new Set([
  "take", "bring", "give", "get", "put", "make", "fit", "tell", "ask", "show",
  "open", "close", "return", "deliver", "plant", "light", "feed", "free", "fix",
  "mend", "carry", "wear", "use", "find", "hand", "place", "fetch", "craft",
  "build", "finish", "start", "reach", "cross", "climb", "sing", "read", "write",
  "drink", "eat", "wake", "calm", "persuade", "convince", "rescue", "escape",
]);

/**
 * One line, one thing.
 *
 * A family's personal aim read *"Craft the oversized wooden coffee mug and
 * successfully take the first morning sip from it"* — two conditions, one ○,
 * and no way to see that the crafting was done and the sip was not. So the
 * evening included a turn where a father drank from a mug, watched nothing
 * happen, and reasonably concluded the game was broken.
 *
 * Splitting them is half the fix; the prompt now asks for one thing per
 * objective, which is the other half. This exists because a 7B model asked for
 * one thing will sometimes write two anyway, and because the storyline library
 * was written by hand before anybody made this rule.
 *
 * Deliberately timid. A wrong split invents an objective that can never be
 * finished, which is exactly the failure this whole round is fixing — so a bare
 * "and" only splits when what follows it reads as an instruction, and
 * "a needle and thread" survives untouched.
 */
export function splitObjective(text: string): string[] {
  const trimmed = text.trim().replace(/[.]+$/, "");
  if (!trimmed) return [];

  for (const join of STRONG_JOINS) {
    const at = trimmed.toLocaleLowerCase().indexOf(join);
    if (at > 0) {
      const head = trimmed.slice(0, at).trim();
      const tail = trimmed.slice(at + join.length).trim();
      if (head.length >= 6 && tail.length >= 6) {
        return [...splitObjective(head), ...splitObjective(tail)];
      }
    }
  }

  const at = trimmed.toLocaleLowerCase().indexOf(" and ");
  if (at > 0) {
    const head = trimmed.slice(0, at).trim();
    const tail = trimmed.slice(at + 5).trim();
    const firstWord = tail.split(/\s+/)[0]?.toLocaleLowerCase().replace(/[^a-z]/g, "") ?? "";
    if (head.length >= 6 && tail.length >= 6 && IMPERATIVES.has(firstWord)) {
      return [...splitObjective(head), ...splitObjective(tail)];
    }
  }

  return [trimmed];
}

/**
 * Objectives as they should be written down, split and numbered.
 *
 * Capped, because a model that writes one enormous sentence should not turn a
 * chapter into a checklist of nine.
 */
export function objectiveRows(
  entries: { kind: "FIND" | "DEED"; text: string }[],
  limit = 5,
): { kind: "FIND" | "DEED"; text: string; position: number }[] {
  const rows: { kind: "FIND" | "DEED"; text: string; position: number }[] = [];

  for (const entry of entries) {
    for (const text of splitObjective(entry.text)) {
      if (rows.some((row) => row.text.toLocaleLowerCase() === text.toLocaleLowerCase())) continue;
      rows.push({ kind: entry.kind, text, position: rows.length });
      if (rows.length === limit) return rows;
    }
  }

  return rows;
}

/**
 * How many turns an objective may sit untouched before the game says something.
 *
 * Six is roughly a third of an evening. Long enough that a party working
 * steadily toward something is never nagged, short enough that nobody spends a
 * whole session circling a locked door.
 */
export const STUCK_AFTER = 6;

export type StuckObjective = { text: string; turns: number };

/**
 * What the party has been after for a long time without getting near it.
 *
 * The act clock already notices a table going nowhere *in general*. Nothing
 * noticed a table going nowhere *at one particular thing* — which is what
 * sixteen turns in chapter one actually looked like. They were busy, inventive
 * and having a nice time; they were also no closer to the one thing the chapter
 * was waiting on, and no part of the game was watching that number.
 *
 * Measured from when the quest opened rather than from the last attempt,
 * deliberately. "You have not touched this in six turns" needs a record of
 * attempts per objective, which does not exist; "this has been outstanding for
 * sixteen turns" needs one subtraction and is the number that actually matters
 * to a family wondering why they are still in the same room.
 */
export function stuckObjectives(
  quests: { openedAtTurn: number; objectives: { text: string; doneAtTurn: number | null }[] }[],
  turnCounter: number,
  after = STUCK_AFTER,
): StuckObjective[] {
  const out: StuckObjective[] = [];

  for (const quest of quests) {
    const turns = turnCounter - quest.openedAtTurn;
    if (turns < after) continue;
    // Only when *nothing* on this quest has moved. A party that has ticked one
    // of three is making progress, and telling them they are stuck would be
    // both wrong and discouraging.
    if (quest.objectives.some((objective) => objective.doneAtTurn !== null)) continue;

    for (const objective of quest.objectives) {
      if (objective.doneAtTurn !== null) continue;
      out.push({ text: objective.text, turns });
    }
  }

  return out;
}

/**
 * What the storyteller is told about it.
 *
 * Written as an instruction to put the thing back within reach, and — this is
 * the load-bearing half — as a prohibition on handing it over. A model told
 * "they are stuck" and nothing else will solve the chapter for them, which is
 * the one way to spoil this game. The wording deliberately echoes the rule the
 * pressure clock uses for the same reason.
 */
export function stuckNote(stuck: StuckObjective[]): string {
  if (stuck.length === 0) return "";

  const list = stuck.slice(0, 3).map((entry) => `- ${entry.text}`).join("\n");
  const turns = Math.max(...stuck.map((entry) => entry.turns));

  return (
    `STILL WAITING, ${turns} TURNS LATER:\n${list}\n` +
    `The party has been at this a long time and has got nowhere near it. Put it ` +
    `back within reach in this passage: somewhere they can see, somebody who ` +
    `mentions it, a way in that is now open. Do NOT hand it over and do NOT have ` +
    `somebody bring it to them — picking it up is still a turn one of them has to ` +
    `take. Getting them into the room with it is the whole job.`
  );
}

export type SpentItem = { itemName: string; foundByName: string };

/**
 * What the table is told when a quest finishes.
 *
 * Written out here rather than inline so the wording is one thing that can be
 * read and changed, and so the interesting case — who gave up what — is not
 * buried in a transaction.
 */
export function completionMessages(
  quest: {
    title: string;
    kind: QuestKind;
    secretForName?: string | null;
    /** Hers, his or theirs — see below. */
    secretForPronouns?: string | null;
  },
  spent: SpentItem[],
  xp: number,
): string[] {
  const messages: string[] = [];

  // A personal quest is announced as a reveal, because until this moment nobody
  // else knew she was carrying it. That is most of the pleasure of it.
  // "of her own" was hardcoded, and a real evening caught it: the line came out
  // as "Orin had something of her own to do" for a father with he/him on his
  // sheet. Every other surface in the game reads pronouns off the character;
  // this one sentence was guessing, and guessing wrong is worse here than
  // anywhere else, because it lands in the middle of somebody's proudest moment.
  const theirs = pronounsOf(quest.secretForPronouns).possessive;
  const opening =
    quest.kind === "PERSONAL" && quest.secretForName
      ? `${quest.secretForName} had something of ${theirs} own to do: ${quest.title} — done.`
      : `${quest.title} — done.`;

  if (spent.length === 0) {
    messages.push(opening);
  } else {
    // Named individually when different people gave things up, because which
    // child handed over which thing is the part they will remember.
    const byFinder = spent.map((item) => `${item.foundByName} gave up ${item.itemName}`);
    messages.push(`${opening} ${listOf(byFinder)}.`);
  }

  if (xp > 0) {
    messages.push(
      quest.kind === "PERSONAL" && quest.secretForName
        ? `${quest.secretForName} gains ${xp} experience for it.`
        : `Everyone gains ${xp} experience for finishing it.`,
    );
  }

  return messages;
}

/** What the table is told the moment somebody turns up a sought thing. */
export function findMessage(questTitle: string, resolution: FindResolution): string {
  return `${resolution.foundByName} has ${resolution.itemName} — one of the things ${questTitle} was waiting for.`;
}

// ---- The database side ------------------------------------------------------

type ActLike = { index: number; title: string; seeks: string[] };

/**
 * Opens the quest for a chapter, if it does not already have one.
 *
 * The chapter's own `goal` is deliberately not used as the summary: it is
 * written at the Game Master ("Nobody should be able to calm it alone") and
 * hands the family the mechanism. What the players get is the chapter's name
 * and the things it is asking for, which is all a tracker needs.
 *
 * Later chapters are never opened early. What a chapter wants is a spoiler, and
 * the finds page has always taken the same line.
 */
export async function openMainQuest(
  tx: Tx,
  campaignId: string,
  act: ActLike,
  turn: number,
): Promise<void> {
  // Scoped to MAIN deliberately. Personal quests carry a chapter of their own,
  // so an unscoped look would find one of those and decide the chapter already
  // had its quest.
  const existing = await tx.quest.findFirst({
    where: { campaignId, kind: "MAIN", actIndex: act.index },
    select: { id: true },
  });
  if (existing) return;

  await tx.quest.create({
    data: {
      campaignId,
      kind: "MAIN",
      actIndex: act.index,
      title: act.title,
      summary:
        act.seeks.length > 0
          ? `Chapter ${act.index}. Come away with ${listOf(act.seeks)}.`
          : `Chapter ${act.index}. See it through.`,
      openedAtTurn: turn,
      objectives: {
        create:
          act.seeks.length > 0
            ? objectiveRows(act.seeks.map((name) => ({ kind: "FIND" as const, text: name })))
            : // A chapter that asks for nothing in particular still needs one
              // thing to be waiting on, or it would open already finished.
              [{ kind: "DEED" as const, text: `See ${act.title} through`, position: 0 }],
      },
    },
  });
}

export type PersonalAim = {
  character: string;
  title: string;
  summary: string;
  objective: { kind: "FIND" | "DEED"; text: string };
};

/**
 * Gives each character her own aim for the chapter.
 *
 * Guarded the same way the chapter's own quest is — looked for before it is
 * created — so a chapter that opens twice, or a turn that is taken back and
 * replayed, does not leave her with two.
 */
export async function openPersonalQuests(
  tx: Tx,
  campaignId: string,
  actIndex: number,
  aims: PersonalAim[],
  party: { characterId: string; characterName: string }[],
  turn: number,
): Promise<void> {
  for (const aim of aims) {
    const member = party.find(
      (entry) => entry.characterName.toLocaleLowerCase() === aim.character.trim().toLocaleLowerCase(),
    );
    // An aim for somebody who is not travelling belongs to nobody.
    if (!member) continue;

    const existing = await tx.quest.findFirst({
      where: {
        campaignId,
        kind: "PERSONAL",
        actIndex,
        secretForCharacterId: member.characterId,
      },
      select: { id: true },
    });
    if (existing) continue;

    await tx.quest.create({
      data: {
        campaignId,
        kind: "PERSONAL",
        actIndex,
        secretForCharacterId: member.characterId,
        title: aim.title.trim(),
        summary: aim.summary.trim(),
        openedAtTurn: turn,
        // Split, because this is where the two-in-one line came from. A model
        // asked for "the one thing that finishes it" will occasionally answer
        // with two, and a personal aim is the worst place for that: it is the
        // one objective on the board nobody else can see, so nobody else can
        // notice it is stuck.
        objectives: { create: objectiveRows([aim.objective]) },
      },
    });
  }
}

export type QuestOpening = {
  title: string;
  summary: string;
  objectives: { kind: "FIND" | "DEED"; text: string }[];
};

/** How many side quests one turn may open. A storyteller in a generous mood
 * can otherwise bury the tracker in errands nobody asked for. */
const MAX_SIDE_QUESTS_PER_TURN = 2;

/** And how many can be open at once, for the same reason. */
const MAX_OPEN_SIDE_QUESTS = 5;

async function openSideQuests(
  tx: Tx,
  campaignId: string,
  openings: QuestOpening[],
  turn: number,
): Promise<string[]> {
  if (openings.length === 0) return [];

  const alreadyOpen = await tx.quest.count({
    where: { campaignId, kind: "SIDE", status: "ACTIVE" },
  });
  const room = Math.max(0, MAX_OPEN_SIDE_QUESTS - alreadyOpen);
  if (room === 0) return [];

  // Titles the campaign has already seen, so a storyteller reminded of the
  // missing cat every other turn does not open the same errand five times.
  const seen = new Set(
    (await tx.quest.findMany({ where: { campaignId }, select: { title: true } })).map((quest) =>
      quest.title.trim().toLocaleLowerCase(),
    ),
  );

  const messages: string[] = [];

  for (const opening of openings.slice(0, MAX_SIDE_QUESTS_PER_TURN)) {
    if (messages.length >= room) break;

    const title = opening.title.trim();
    if (!title || seen.has(title.toLocaleLowerCase())) continue;
    seen.add(title.toLocaleLowerCase());

    await tx.quest.create({
      data: {
        campaignId,
        kind: "SIDE",
        title,
        summary: opening.summary.trim() || title,
        openedAtTurn: turn,
        objectives: { create: objectiveRows(opening.objectives) },
      },
    });

    messages.push(`New quest — ${title}. ${opening.summary.trim()}`.trim());
  }

  return messages;
}

/**
 * Finishes a quest: spends what it took, hands out the experience, and says so.
 *
 * The spending is the part with a decision in it. Every item that satisfied one
 * of this quest's finds leaves the pack of whoever was carrying it — a key that
 * stays in your pocket after it has opened the door was never really the price
 * of anything. A stack goes down by one rather than vanishing, and what left
 * arrives on the character's sheet as a keepsake naming what it bought.
 */
async function completeQuest(
  tx: Tx,
  quest: {
    id: string;
    title: string;
    kind: QuestKind;
    campaignId: string;
    secretForCharacterId: string | null;
  },
  partyCharacterIds: string[],
  turn: number,
): Promise<string[]> {
  const objectives = await tx.questObjective.findMany({
    where: { questId: quest.id, kind: "FIND", doneAtTurn: { not: null } },
    orderBy: { position: "asc" },
  });

  const spent: SpentItem[] = [];

  for (const objective of objectives) {
    if (!objective.itemName || !objective.foundByCharacterId) continue;

    const held = await tx.inventoryItem.findUnique({
      where: {
        characterId_name: {
          characterId: objective.foundByCharacterId,
          name: objective.itemName,
        },
      },
    });
    // Given away, spent on something else, or already gone. The objective still
    // counts — it was met — but there is nothing left to hand over.
    if (!held) continue;

    if (held.quantity > 1) {
      await tx.inventoryItem.update({
        where: { id: held.id },
        data: { quantity: { decrement: 1 } },
      });
    } else {
      await tx.inventoryItem.delete({ where: { id: held.id } });
    }

    const finder = await tx.character.findUnique({
      where: { id: objective.foundByCharacterId },
      select: { name: true },
    });

    await tx.keepsake.create({
      data: {
        characterId: objective.foundByCharacterId,
        name: objective.itemName,
        note: `given up to finish ${quest.title}`,
        campaignId: quest.campaignId,
      },
    });

    await tx.questObjective.update({ where: { id: objective.id }, data: { consumed: true } });

    spent.push({ itemName: objective.itemName, foundByName: finder?.name ?? "somebody" });
  }

  await tx.quest.update({
    where: { id: quest.id },
    data: { status: "COMPLETE", completedAtTurn: turn, completedAt: new Date() },
  });

  const xp = QUEST_XP[quest.kind];

  // A personal quest pays her alone. It was the one thing on the board that was
  // hers, and splitting it four ways would quietly take that back.
  const paid =
    quest.kind === "PERSONAL" && quest.secretForCharacterId
      ? [quest.secretForCharacterId]
      : partyCharacterIds;

  const secretFor = quest.secretForCharacterId
    ? await tx.character.findUnique({
        where: { id: quest.secretForCharacterId },
        select: { name: true, pronouns: true },
      })
    : null;

  const messages = completionMessages(
    { ...quest, secretForName: secretFor?.name ?? null, secretForPronouns: secretFor?.pronouns },
    spent,
    xp,
  );

  for (const characterId of paid) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { name: true, xp: true, level: true },
    });
    if (!character) continue;

    const total = character.xp + xp;
    // High-water mark — see `levelReached`. Nobody goes down a level because
    // the ladder was retuned underneath them.
    const level = levelReached(total, character.level);
    await tx.character.update({ where: { id: characterId }, data: { xp: total, level } });

    if (level > character.level) messages.push(`${character.name} reached level ${level}!`);
  }

  return messages;
}

export type QuestTurnInput = {
  campaignId: string;
  /** Everyone travelling, so experience reaches them and pockets can be read. */
  party: { characterId: string; characterName: string }[];
  turn: number;
  /** Non-item objectives the storyteller says were accomplished. */
  deedsDone: string[];
  /** Errands the storyteller wants to open. */
  questsOpened: QuestOpening[];
  /** Set when the chapter's own goal was met this turn. */
  actComplete: boolean;
  /** The chapter just played, and the one after it. */
  act: ActLike | undefined;
  nextAct: ActLike | undefined;
};

/**
 * Everything quests do in one turn, in the order that keeps them honest.
 *
 * Ticking comes before completing, so a quest finished by the last thing found
 * this turn finishes *this* turn rather than next. Completing comes before the
 * chapter advances, so the chapter's own quest is finished by the party rather
 * than swept up as abandoned by the story moving on.
 */
/**
 * Will this chapter's own work be finished once this turn is applied?
 *
 * Asked *before* the transaction, and that is the whole awkwardness of it: the
 * next chapter's personal aims need a model call, model calls cannot happen
 * inside a transaction, so whether the story moves on has to be decided while
 * the turn is still only a set of intentions.
 *
 * The reason it has to be asked at all comes from a real evening. A family
 * finished every objective of chapter one — the album, the camera film, both
 * ticked off and the chapter quest marked complete — and then played six more
 * turns in the same kitchen, because advancing the act listened only to the
 * storyteller volunteering `actComplete` and it never did. Ten turns, one
 * location, one chapter. "No real direction" was the note, and it was fair.
 *
 * So the hard signal wins here the same way it does in `lib/game/pressure.ts`:
 * if the chapter's work is done, the chapter is over, whatever the model thinks.
 * The resolvers below are the same ones that do the actual ticking a moment
 * later, called rather than approximated, so this cannot answer differently
 * from what the transaction then does.
 */
export async function chapterWillBeDone(
  tx: Tx,
  input: {
    campaignId: string;
    actIndex: number;
    partyCharacterIds: string[];
    /** Items the storyteller says were picked up this turn, holder included. */
    gained: CarriedLike[];
    deedsDone: string[];
  },
): Promise<boolean> {
  const chapterQuest = await tx.quest.findFirst({
    where: { campaignId: input.campaignId, actIndex: input.actIndex, status: "ACTIVE" },
    include: { objectives: { orderBy: { position: "asc" } } },
  });
  // No open chapter quest means either it is already finished or there never
  // was one. Neither is a reason to hold the story in this room.
  if (!chapterQuest) return false;
  if (chapterQuest.objectives.length === 0) return false;

  const carriedRows = await tx.inventoryItem.findMany({
    where: {
      characterId: { in: input.partyCharacterIds },
      foundInCampaignId: input.campaignId,
    },
    orderBy: { name: "asc" },
  });

  const carried: CarriedLike[] = [
    ...carriedRows.map((item) => ({
      name: item.name,
      holderId: item.characterId,
      holderName: "",
    })),
    ...input.gained,
  ];

  const finds = new Set(
    resolveFinds(chapterQuest.objectives, carried).map((find) => find.objectiveId),
  );
  const deeds = new Set(resolveDeeds(chapterQuest.objectives, input.deedsDone));

  return chapterQuest.objectives.every(
    (objective) => objective.doneAtTurn !== null || finds.has(objective.id) || deeds.has(objective.id),
  );
}

export async function advanceQuests(tx: Tx, input: QuestTurnInput): Promise<string[]> {
  const messages: string[] = [];

  const quests = await tx.quest.findMany({
    where: { campaignId: input.campaignId, status: "ACTIVE" },
    include: { objectives: { orderBy: { position: "asc" } } },
  });

  // Only what was found on this adventure. An adventurer arrives carrying
  // whatever they earned elsewhere, and a chapter should not tick itself off
  // against a rope from a story two years ago — which is also the rule the
  // finds page has always shown the family.
  const carriedRows = await tx.inventoryItem.findMany({
    where: {
      characterId: { in: input.party.map((member) => member.characterId) },
      foundInCampaignId: input.campaignId,
    },
    orderBy: { name: "asc" },
  });

  const nameById = new Map(input.party.map((member) => [member.characterId, member.characterName]));
  const carried: CarriedLike[] = carriedRows.map((item) => ({
    name: item.name,
    holderId: item.characterId,
    holderName: nameById.get(item.characterId) ?? "somebody",
  }));

  // ---- Tick off what has been done ------------------------------------------
  for (const quest of quests) {
    for (const resolution of resolveFinds(quest.objectives, carried)) {
      await tx.questObjective.update({
        where: { id: resolution.objectiveId },
        data: {
          doneAtTurn: input.turn,
          itemName: resolution.itemName,
          foundByCharacterId: resolution.foundByCharacterId,
        },
      });
      messages.push(findMessage(quest.title, resolution));

      // Keep the in-memory copy in step, so the completion check below sees it.
      const objective = quest.objectives.find((entry) => entry.id === resolution.objectiveId);
      if (objective) objective.doneAtTurn = input.turn;
    }

    for (const objectiveId of resolveDeeds(quest.objectives, input.deedsDone)) {
      await tx.questObjective.update({
        where: { id: objectiveId },
        data: { doneAtTurn: input.turn },
      });
      const objective = quest.objectives.find((entry) => entry.id === objectiveId);
      if (objective) objective.doneAtTurn = input.turn;
    }
  }

  // ---- Finish anything that is now finished ---------------------------------
  for (const quest of quests) {
    if (quest.objectives.length === 0) continue;
    if (quest.objectives.some((objective) => objective.doneAtTurn === null)) continue;

    messages.push(
      ...(await completeQuest(
        tx,
        {
          id: quest.id,
          title: quest.title,
          kind: quest.kind,
          campaignId: input.campaignId,
          secretForCharacterId: quest.secretForCharacterId,
        },
        input.party.map((member) => member.characterId),
        input.turn,
      )),
    );
    quest.status = "COMPLETE";
  }

  // ---- The chapter moving on ------------------------------------------------
  if (input.actComplete && input.act) {
    const chapterQuest = quests.find(
      (quest) => quest.actIndex === input.act?.index && quest.status === "ACTIVE",
    );

    // The story has left this chapter behind. Its quest ends either way — but
    // as complete when the party met everything it asked for by other means,
    // and as abandoned when they did not, because a journal that reports every
    // chapter as triumphantly finished is not worth reading.
    if (chapterQuest) {
      const everythingDone = chapterQuest.objectives.every(
        (objective) => objective.doneAtTurn !== null,
      );

      if (everythingDone) {
        messages.push(
          ...(await completeQuest(
            tx,
            {
              id: chapterQuest.id,
              title: chapterQuest.title,
              kind: chapterQuest.kind,
              campaignId: input.campaignId,
              secretForCharacterId: chapterQuest.secretForCharacterId,
            },
            input.party.map((member) => member.characterId),
            input.turn,
          )),
        );
      } else {
        await tx.quest.update({
          where: { id: chapterQuest.id },
          data: { status: "ABANDONED", completedAtTurn: input.turn, completedAt: new Date() },
        });
      }
    }

    if (input.nextAct) await openMainQuest(tx, input.campaignId, input.nextAct, input.turn);
  }

  // ---- New errands ----------------------------------------------------------
  messages.push(...(await openSideQuests(tx, input.campaignId, input.questsOpened, input.turn)));

  return messages;
}

/**
 * Whether this account may see a quest on the board.
 *
 * Only personal quests are ever hidden, and only while they are unfinished —
 * the reveal at the end is most of the point of one. Visibility follows who
 * owns the character rather than who is hosting, which gets both kinds of table
 * right without a special case: on one shared screen the parent owns every
 * adventurer and sees everything, which is what running the table needs; on
 * four phones each girl owns hers and nobody else's aim appears.
 *
 * A viewer of `undefined` sees no personal quests at all. That is the safe way
 * for a caller to be wrong.
 */
export function questVisibleTo(
  quest: {
    kind: QuestKind;
    status: "ACTIVE" | "COMPLETE" | "ABANDONED";
    secretForUserId: string | null;
  },
  viewerUserId: string | undefined,
): boolean {
  if (quest.kind !== "PERSONAL") return true;
  if (quest.status !== "ACTIVE") return true;
  return viewerUserId !== undefined && quest.secretForUserId === viewerUserId;
}

export type QuestBoardEntry = {
  id: string;
  kind: QuestKind;
  status: "ACTIVE" | "COMPLETE" | "ABANDONED";
  /** Whose aim this is, when it is a personal one. */
  secretForCharacterId: string | null;
  secretForName: string | null;
  title: string;
  summary: string;
  actIndex: number | null;
  objectives: {
    id: string;
    kind: "FIND" | "DEED";
    text: string;
    done: boolean;
    itemName: string | null;
    foundByName: string | null;
    consumed: boolean;
    /** The words a FIND would actually accept — see `whatWouldCount`. */
    counts: string[];
  }[];
};

/**
 * The board, in the order a table reads it: what is open, then what is behind
 * you. One loader for all three places that show it, so the table, the board
 * and the printed journal can never disagree about what happened.
 */
export async function questBoard(
  db: { quest: Tx["quest"] },
  campaignId: string,
  /**
   * The account looking. Personal quests belong to whoever owns the character,
   * and stay off everybody else's board until they are finished.
   *
   * Ownership rather than a host exception, because it gets both tables right
   * on its own: on one shared screen the parent owns every character and sees
   * everything, which is what running the table needs; on four phones each girl
   * owns hers and nobody else's aim shows up.
   *
   * Omit it and nothing personal is shown at all — the safe direction to fail
   * in, since a caller that forgot reveals nothing rather than everything.
   */
  viewerUserId?: string,
): Promise<QuestBoardEntry[]> {
  const quests = await db.quest.findMany({
    where: { campaignId },
    include: {
      objectives: {
        orderBy: { position: "asc" },
        include: { foundBy: { select: { name: true } } },
      },
      secretFor: { select: { name: true, userId: true } },
    },
    orderBy: [{ actIndex: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const rank = { ACTIVE: 0, COMPLETE: 1, ABANDONED: 2 };

  return quests
    .filter((quest) =>
      questVisibleTo({ ...quest, secretForUserId: quest.secretFor?.userId ?? null }, viewerUserId),
    )
    .map((quest) => ({
      id: quest.id,
      kind: quest.kind,
      status: quest.status,
      title: quest.title,
      summary: quest.summary,
      actIndex: quest.actIndex,
      secretForCharacterId: quest.secretForCharacterId,
      secretForName: quest.secretFor?.name ?? null,
      objectives: quest.objectives.map((objective) => ({
        id: objective.id,
        kind: objective.kind,
        text: objective.text,
        done: objective.doneAtTurn !== null,
        itemName: objective.itemName,
        foundByName: objective.foundBy?.name ?? null,
        consumed: objective.consumed,
        counts: objective.kind === "FIND" ? whatWouldCount(objective.text) : [],
      })),
    }))
    .sort((a, b) => rank[a.status] - rank[b.status]);
}
