/**
 * Wires the Game Master pipeline to the database.
 *
 * Everything the model sees is loaded here, and everything it produces is
 * committed here. The pipeline itself (lib/engine/gm.ts) stays free of
 * persistence so it can be tested without a database or a model server.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client.ts";
import { buildContext, type MemoryContext, type TurnContext } from "@/lib/ai/context";
import {
  conversationPrompt,
  openingPrompt,
  personalQuestsPrompt,
  suggestionPrompt,
  summaryPrompt,
  systemPrompt,
  type ReadingLevelKey,
  type ToneKey,
} from "@/lib/ai/prompts";
import { personalQuestsSchema, suggestionsSchema, summarySchema, validator } from "@/lib/ai/schemas";
import { requestStructured } from "@/lib/ai/json";
import { chat, type AiConfig, type TokenUsage } from "@/lib/ai/provider";
import { resolveAiConfig } from "@/lib/ai/settings";
import { checkNarration, checkPlayerInput, IN_FICTION_DEFLECTION, safetyReminder } from "@/lib/ai/safety";
import { runTurn, type ModelCalls, type TurnProgress } from "@/lib/engine/gm";
import { captureSnapshot } from "@/lib/engine/undo";
import { xpForOutcome } from "@/lib/engine/dice";
import { memberCampaignFilter } from "@/lib/game/access";
import {
  advanceQuests,
  openMainQuest,
  openPersonalQuests,
  type PersonalAim,
} from "@/lib/game/quests";
import { pacingGuidance } from "@/lib/game/pacing";
import { MAX_SKILLS, learnedMessage, practiceKey, readyToLearn, skillNameFrom } from "@/lib/game/practice";
import { extraSkillRoom } from "@/lib/game/knacks";
import {
  acquaintanceKey,
  metMessage,
  whoComesHome,
  type KnownPerson,
} from "@/lib/game/acquaintances";
import {
  SKILL_XP_PER_USE,
  bondLevelFor,
  familyMoveByKey,
  kindFromPerspective,
  levelFor,
  movesUnlockedBetween,
  skillRankFor,
  type StatKey,
} from "@/lib/game/rules";

/** How many recent turns are offered to the context builder before trimming. */
const RECENT_TURN_WINDOW = 12;

export function modelCalls(config: AiConfig, onCall?: (record: AiCallRecord) => void): ModelCalls {
  return {
    async json(prompt, repairHint) {
      const started = Date.now();
      const messages = repairHint
        ? [
            { role: "user" as const, content: prompt },
            { role: "assistant" as const, content: "(unusable reply)" },
            { role: "user" as const, content: repairHint },
          ]
        : [{ role: "user" as const, content: prompt }];

      let usage: TokenUsage | null = null;

      try {
        const reply = await chat(config, {
          messages,
          // Structured output wants determinism, not flair.
          temperature: 0,
          json: true,
          maxTokens: 700,
          onUsage: (reported) => (usage = reported),
        });
        onCall?.({ stage: "json", model: config.model, latencyMs: Date.now() - started, ok: true, prompt, reply, usage });
        return reply;
      } catch (error) {
        onCall?.({
          stage: "json",
          model: config.model,
          latencyMs: Date.now() - started,
          ok: false,
          prompt,
          reply: "",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async prose(system, prompt) {
      const started = Date.now();
      let usage: TokenUsage | null = null;

      try {
        const reply = await chat(config, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          model: config.narrationModel,
          temperature: 0.85,
          maxTokens: 700,
          onUsage: (reported) => (usage = reported),
        });
        onCall?.({
          stage: "narrate",
          model: config.narrationModel,
          latencyMs: Date.now() - started,
          ok: true,
          prompt,
          reply,
          usage,
        });
        return reply;
      } catch (error) {
        onCall?.({
          stage: "narrate",
          model: config.narrationModel,
          latencyMs: Date.now() - started,
          ok: false,
          prompt,
          reply: "",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

export type AiCallRecord = {
  stage: string;
  model: string;
  latencyMs: number;
  ok: boolean;
  prompt: string;
  reply: string;
  error?: string;
  /** Only hosted providers report this; local servers usually do not. */
  usage?: TokenUsage | null;
};

async function logAiCalls(campaignId: string, records: AiCallRecord[], repairs: number) {
  if (records.length === 0) return;
  await db.aiCall
    .createMany({
      data: records.map((record) => ({
        campaignId,
        stage: record.stage,
        model: record.model,
        latencyMs: record.latencyMs,
        ok: record.ok,
        repairs,
        error: record.error ?? null,
        inputTokens: record.usage?.inputTokens ?? null,
        outputTokens: record.usage?.outputTokens ?? null,
        promptPreview: record.prompt.slice(0, 2000),
        responsePreview: record.reply.slice(0, 2000),
      })),
    })
    .catch(() => {
      // Debug logging must never be the reason a turn fails.
    });
}

/**
 * Loads a campaign with everything the prompt needs.
 *
 * Scoped to the people at the table rather than to the account that created it:
 * once a household has joined with the code, their adventurer is in the party
 * and they can play the turn like anybody else.
 */
async function loadCampaign(campaignId: string, userId: string) {
  return db.campaign.findFirst({
    where: memberCampaignFilter(campaignId, userId),
    include: {
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            include: {
              skills: true,
              knacks: { select: { key: true } },
              relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
              relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      scenes: { orderBy: { index: "asc" } },
      memories: true,
    },
  });
}

type LoadedCampaign = NonNullable<Awaited<ReturnType<typeof loadCampaign>>>;

function partyContext(campaign: LoadedCampaign) {
  return campaign.party.map((member) => ({
    name: member.character.name,
    race: member.character.race,
    archetype: member.character.archetype,
    pronouns: member.character.pronouns,
    ageBand: member.character.ageBand,
    description: member.character.description,
    level: member.character.level,
    stats: {
      might: member.character.might,
      wits: member.character.wits,
      heart: member.character.heart,
      spark: member.character.spark,
    } as Record<StatKey, number>,
    skills: member.character.skills.map((skill) => ({ name: skill.name, rank: skill.rank })),
    knacks: member.character.knacks.map((knack) => knack.key),
  }));
}

function bondContext(campaign: LoadedCampaign) {
  const inParty = new Set(campaign.party.map((member) => member.characterId));

  return campaign.party.flatMap((member) =>
    [...member.character.relationshipsA, ...member.character.relationshipsB]
      .map((row) => {
        const other = "characterB" in row ? row.characterB : row.characterA;
        return {
          from: member.character.name,
          to: other.name,
          otherId: other.id,
          kind: kindFromPerspective(row, member.characterId),
          level: row.bondLevel,
        };
      })
      // Each pair appears from both sides; keep one, and only if both travel.
      .filter((bond) => inParty.has(bond.otherId) && member.characterId < bond.otherId),
  );
}

async function buildCampaignContext(campaign: LoadedCampaign, maxTokens: number) {
  const openScene = campaign.scenes.find((scene) => scene.status === "OPEN");
  const act =
    campaign.storyline.acts.find((entry) => entry.index === campaign.currentActIndex) ??
    campaign.storyline.acts[0];

  const recentTurns: TurnContext[] = openScene
    ? (
        await db.turnEvent.findMany({
          where: { sceneId: openScene.id },
          orderBy: { ordinal: "desc" },
          take: RECENT_TURN_WINDOW,
        })
      )
        .reverse()
        .map((turn) => ({ type: turn.type, content: turn.content }))
    : [];

  const memories: MemoryContext[] = campaign.memories.map((memory) => ({
    kind: memory.kind,
    key: memory.key,
    content: memory.content,
    importance: memory.importance,
    lastSeenAt: memory.lastSeenAt,
  }));

  return buildContext({
    campaignTitle: campaign.title,
    storylineTitle: campaign.storyline.title,
    premise: campaign.storyline.premise,
    actTitle: act?.title ?? "The adventure",
    actGoal: act?.goal ?? "",
    actBeats: act?.beats ?? [],
    actSeeks: act?.seeks ?? [],
    itemsHeld: await heldItemNames(campaign.id),
    personalAims: await personalAimsFor(campaign.id),
    knownPeople: await knownPeopleFor(campaign),
    party: partyContext(campaign),
    bonds: bondContext(campaign),
    location: openScene?.location,
    sceneSummary: openScene?.summary,
    priorScenes: campaign.scenes
      .filter((scene) => scene.status === "CLOSED" && scene.summary)
      .map((scene) => `${scene.title}: ${scene.summary}`),
    memories,
    recentTurns,
    currentTurnCounter: campaign.turnCounter,
    maxTokens,
  });
}

/**
 * What the party is carrying that they found in *this* adventure.
 *
 * Told to the storyteller so it stops offering the brass key to a party that
 * has been carrying the brass key since Tuesday — which is the single most
 * common way a model with a short memory breaks the spell.
 */
async function heldItemNames(campaignId: string): Promise<string[]> {
  const items = await db.inventoryItem.findMany({
    where: { foundInCampaignId: campaignId },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  return [...new Set(items.map((item) => item.name))];
}

/**
 * Everyone's outstanding personal aim, for the storyteller's eyes only.
 *
 * Finished ones are left out: an aim it is still being told to engineer moments
 * for, after she has already pulled it off, is how a chapter ends up circling
 * the same beat.
 */
async function personalAimsFor(campaignId: string): Promise<{ character: string; aim: string }[]> {
  const quests = await db.quest.findMany({
    where: { campaignId, kind: "PERSONAL", status: "ACTIVE" },
    include: {
      secretFor: { select: { name: true } },
      objectives: { orderBy: { position: "asc" }, take: 1 },
    },
  });

  return quests
    .filter((quest) => quest.secretFor !== null)
    .map((quest) => ({
      character: quest.secretFor!.name,
      aim: quest.objectives[0]?.text ?? quest.summary,
    }));
}

/**
 * People this party met on earlier adventures.
 *
 * Gathered across everybody travelling and merged, because "Mira and Rowan both
 * know the beekeeper" is a different and better sentence than the same person
 * listed twice. Anybody met on *this* adventure is left out — they are already
 * in the campaign's own memory, and offering the storyteller a reunion with
 * somebody standing in front of it would be strange.
 */
async function knownPeopleFor(campaign: LoadedCampaign): Promise<KnownPerson[]> {
  const rows = await db.acquaintance.findMany({
    where: {
      characterId: { in: campaign.party.map((member) => member.characterId) },
      NOT: { metInCampaignId: campaign.id },
    },
    orderBy: [{ timesMet: "desc" }, { updatedAt: "desc" }],
  });
  if (rows.length === 0) return [];

  const namesById = new Map(
    campaign.party.map((member) => [member.characterId, member.character.name]),
  );

  const merged = new Map<string, KnownPerson>();
  for (const row of rows) {
    const existing = merged.get(row.key);
    const who = namesById.get(row.characterId);

    if (existing) {
      if (who && !existing.knownBy.includes(who)) existing.knownBy.push(who);
      existing.timesMet = Math.max(existing.timesMet, row.timesMet);
      continue;
    }

    merged.set(row.key, {
      name: row.name,
      about: row.about,
      metInCampaignTitle: row.metInCampaignTitle,
      timesMet: row.timesMet,
      knownBy: who ? [who] : [],
    });
  }

  return [...merged.values()];
}

async function nextOrdinal(sceneId: string): Promise<number> {
  const last = await db.turnEvent.findFirst({
    where: { sceneId },
    orderBy: { ordinal: "desc" },
    select: { ordinal: true },
  });
  return (last?.ordinal ?? 0) + 1;
}

/** "Bramble", "Bramble and Fen", "Bramble, Fen and Wren". */
function formatList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Narrates the opening scene and moves the campaign to ACTIVE.
 *
 * Separate from `playTurn` because there are no player actions yet and nothing
 * to adjudicate — just the storyline's hook, turned into prose.
 */
export async function beginCampaign(
  campaignId: string,
  userId: string,
  onProgress?: (event: TurnProgress) => void,
) {
  const campaign = await loadCampaign(campaignId, userId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "SETUP") throw new Error("This adventure has already begun.");
  if (campaign.party.length === 0) throw new Error("Nobody is in the party.");

  // Whoever was invited has not answered yet, and the story is about to name
  // everybody in the opening scene. Beginning without them would mean either a
  // party short of what the storyline needs, or somebody arriving into a scene
  // that has already described who is there.
  if (campaign.party.length < campaign.storyline.minPlayers) {
    const waiting = await db.partyInvite.findMany({
      where: { campaignId: campaign.id, status: "PENDING" },
      select: { character: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const names = waiting.map((invite) => invite.character.name);

    throw new Error(
      names.length > 0
        ? `Still waiting for ${formatList(names)} to accept.`
        : `${campaign.storyline.title} needs at least ${campaign.storyline.minPlayers} adventurers.`,
    );
  }

  const config = await resolveAiConfig();
  const records: AiCallRecord[] = [];
  const calls = modelCalls(config, (record) => records.push(record));

  const built = await buildCampaignContext(campaign, config.maxContextTokens);
  const system = systemPrompt({
    tone: campaign.tone as ToneKey,
    readingLevel: campaign.readingLevel as ReadingLevelKey,
  });

  onProgress?.({ type: "stage", stage: "narrating" });
  let narration = await calls.prose(
    system,
    openingPrompt({ context: built.text, hook: campaign.storyline.hook }),
  );

  const verdict = checkNarration(narration);
  if (!verdict.ok) {
    narration = await calls.prose(
      system,
      `${openingPrompt({ context: built.text, hook: campaign.storyline.hook })}\n\n${safetyReminder(verdict.matched)}`,
    );
  }

  const firstAct = campaign.storyline.acts.find((act) => act.index === 1);

  // Asked for before the transaction opens, because it is a model call.
  const aims = firstAct
    ? await fetchPersonalAims(
        calls,
        built.text,
        firstAct,
        campaign.party.map((member) => ({
          name: member.character.name,
          archetype: member.character.archetype,
          description: member.character.description,
        })),
      )
    : [];

  const scene = await db.$transaction(async (tx) => {
    const created = await tx.scene.create({
      data: {
        campaignId: campaign.id,
        index: 1,
        title: campaign.storyline.acts[0]?.title ?? "The beginning",
        actIndex: 1,
      },
    });

    await tx.turnEvent.create({
      data: { sceneId: created.id, ordinal: 1, type: "NARRATION", content: narration.trim() },
    });

    await tx.campaign.update({
      where: { id: campaign.id },
      data: { status: "ACTIVE", lastPlayedAt: new Date() },
    });

    // The first chapter's quest opens with the story. Later ones open as the
    // party reaches them — what a chapter is asking for is a spoiler.
    if (firstAct) {
      await openMainQuest(tx, campaign.id, firstAct, 0);
      await openPersonalQuests(
        tx,
        campaign.id,
        firstAct.index,
        aims,
        campaign.party.map((member) => ({
          characterId: member.characterId,
          characterName: member.character.name,
        })),
        0,
      );
    }

    return created;
  });

  await logAiCalls(campaign.id, records, 0);

  return { sceneId: scene.id, narration: narration.trim() };
}

/**
 * Asks the storyteller for one aim per character for the chapter ahead.
 *
 * Runs once when a chapter opens, not once a turn, which keeps it to three or
 * four calls an adventure. Outside the turn's transaction on purpose — a model
 * call can take twenty seconds and holding a database transaction open across
 * it would be a good way to wedge the table.
 *
 * Never throws. Personal aims are a bonus thread; losing them costs the evening
 * some texture but nothing that the story depends on, and failing a whole turn
 * over one would be a poor trade.
 */
async function fetchPersonalAims(
  calls: ModelCalls,
  context: string,
  act: { title: string },
  party: { name: string; archetype: string; description: string | null }[],
): Promise<PersonalAim[]> {
  try {
    const result = await requestStructured({
      call: (hint) =>
        calls.json(personalQuestsPrompt({ context, actTitle: act.title, party }), hint),
      validate: validator(personalQuestsSchema),
    });
    return result.value.aims;
  } catch {
    return [];
  }
}

export type PlayerAction = { characterId: string; text: string };

/** A Family Move the table wants to spend this turn. */
export type FamilyMoveChoice = { key: string; helperId: string; targetId: string };

/**
 * Checks a requested Family Move is actually available.
 *
 * The UI only offers legal moves, but the UI is not a security boundary, and
 * an unavailable move that silently worked would quietly devalue every bond in
 * the game.
 */
async function validateFamilyMove(
  campaign: LoadedCampaign,
  choice: FamilyMoveChoice,
  sceneId: string,
): Promise<{ relationshipId: string; moveName: string } | null> {
  const move = familyMoveByKey(choice.key);
  if (!move) return null;

  const inParty = new Set(campaign.party.map((member) => member.characterId));
  if (!inParty.has(choice.helperId) || !inParty.has(choice.targetId)) return null;
  if (choice.helperId === choice.targetId) return null;

  const [a, b] =
    choice.helperId < choice.targetId
      ? [choice.helperId, choice.targetId]
      : [choice.targetId, choice.helperId];

  const relationship = await db.relationship.findUnique({
    where: { characterAId_characterBId: { characterAId: a, characterBId: b } },
  });
  if (!relationship || relationship.bondLevel < move.requires) return null;

  // Once per scene, so it stays a moment rather than a routine.
  const alreadyUsed = await db.familyMoveUse.findUnique({
    where: {
      sceneId_relationshipId_moveKey: {
        sceneId,
        relationshipId: relationship.id,
        moveKey: move.key,
      },
    },
  });
  if (alreadyUsed) return null;

  return { relationshipId: relationship.id, moveName: move.name };
}

/** Runs one party turn and commits everything it produced. */
export async function playTurn(
  campaignId: string,
  userId: string,
  actions: PlayerAction[],
  onProgress?: (event: TurnProgress) => void,
  familyMove?: FamilyMoveChoice | null,
  /** Set when retelling a turn the table took back. */
  correction?: string | null,
) {
  const campaign = await loadCampaign(campaignId, userId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "ACTIVE") throw new Error("This adventure is not in progress.");

  const scene = campaign.scenes.find((entry) => entry.status === "OPEN");
  if (!scene) throw new Error("There is no open scene.");

  const partyIds = new Set(campaign.party.map((member) => member.characterId));
  const accepted = actions.filter((action) => partyIds.has(action.characterId) && action.text.trim());
  if (accepted.length === 0) throw new Error("Nobody said what they were doing.");

  // Children test boundaries. Rather than refusing, the Game Master is told to
  // bend the moment in-story.
  const flagged = accepted.some((action) => !checkPlayerInput(action.text).ok);

  const validMove = familyMove ? await validateFamilyMove(campaign, familyMove, scene.id) : null;

  const config = await resolveAiConfig();
  const records: AiCallRecord[] = [];
  const calls = modelCalls(config, (record) => records.push(record));

  const built = await buildCampaignContext(campaign, config.maxContextTokens);

  const lastNarration = await db.turnEvent.findFirst({
    where: { sceneId: scene.id, type: "NARRATION" },
    orderBy: { ordinal: "desc" },
  });

  // Deeds still outstanding, so the extraction can say which of them the
  // passage finished. Finds are not asked about — they settle themselves by
  // looking in people's pockets.
  const openDeeds = (
    await db.questObjective.findMany({
      where: {
        kind: "DEED",
        doneAtTurn: null,
        quest: { campaignId: campaign.id, status: "ACTIVE" },
      },
      select: { text: true },
      orderBy: { position: "asc" },
    })
  ).map((objective) => objective.text);

  const result = await runTurn(
    {
      context: built.text,
      tone: campaign.tone as ToneKey,
      readingLevel: campaign.readingLevel as ReadingLevelKey,
      sceneText: lastNarration?.content ?? campaign.storyline.hook,
      party: campaign.party.map((member) => ({
        id: member.characterId,
        name: member.character.name,
        stats: {
          might: member.character.might,
          wits: member.character.wits,
          heart: member.character.heart,
          spark: member.character.spark,
        } as Record<StatKey, number>,
        skills: member.character.skills.map((skill) => ({ name: skill.name, rank: skill.rank })),
        knacks: member.character.knacks.map((knack) => knack.key),
      })),
      actions: accepted,
      correction: correction?.trim() || undefined,
      pacing: pacingGuidance({
        pacing: campaign.pacing,
        // Scenes already played in this act, including the one in progress.
        sceneInAct: campaign.scenes.filter(
          (entry) => entry.actIndex === campaign.currentActIndex,
        ).length,
        actIndex: campaign.currentActIndex,
        actCount: campaign.storyline.acts.length,
      }),
      familyMove:
        validMove && familyMove
          ? {
              key: familyMove.key,
              moveName: validMove.moveName,
              helperId: familyMove.helperId,
              targetId: familyMove.targetId,
            }
          : null,
      deflectionNote: flagged ? IN_FICTION_DEFLECTION : null,
      openDeeds,
    },
    calls,
    undefined,
    onProgress,
  );

  const turnCounter = campaign.turnCounter + 1;
  /** Set inside the transaction; the caller needs it to show the ending. */
  let campaignComplete = false;

  // Whether the story is about to move on depends only on what the model just
  // said and on where the campaign already was, so it can be worked out here —
  // which matters, because the next chapter's personal aims need a model call
  // and that cannot happen inside the transaction.
  const movingOn =
    result.extraction.actComplete &&
    campaign.currentActIndex < campaign.storyline.acts.length;
  const nextAct = movingOn
    ? campaign.storyline.acts.find((act) => act.index === campaign.currentActIndex + 1)
    : undefined;

  const nextAims = nextAct
    ? await fetchPersonalAims(
        calls,
        built.text,
        nextAct,
        campaign.party.map((member) => ({
          name: member.character.name,
          archetype: member.character.archetype,
          description: member.character.description,
        })),
      )
    : [];

  await db.$transaction(async (tx) => {
    let ordinal = await nextOrdinal(scene.id);

    // Before anything is written: what the table can go back to. Inside the
    // transaction so a turn that fails leaves no snapshot claiming otherwise.
    const snapshot = await captureSnapshot(
      tx,
      campaign.id,
      campaign.party.map((member) => member.characterId),
    );
    await tx.turnSnapshot.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        turnCounter: campaign.turnCounter,
        fromOrdinal: ordinal,
        state: snapshot as unknown as Prisma.InputJsonValue,
      },
      update: {
        turnCounter: campaign.turnCounter,
        fromOrdinal: ordinal,
        state: snapshot as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });

    for (const action of accepted) {
      await tx.turnEvent.create({
        data: {
          sceneId: scene.id,
          ordinal: ordinal++,
          type: "PLAYER_ACTION",
          actorCharacterId: action.characterId,
          content: action.text.trim(),
        },
      });
    }

    for (const check of result.checks) {
      await tx.turnEvent.create({
        data: {
          sceneId: scene.id,
          ordinal: ordinal++,
          type: "DICE_ROLL",
          actorCharacterId: check.characterId,
          content: `${check.characterName}: ${check.stat} ${check.difficulty} — rolled ${check.roll}, total ${check.total} vs ${check.target} → ${check.outcome}`,
          metadata: {
            stat: check.stat,
            difficulty: check.difficulty,
            roll: check.roll,
            modifier: check.modifier,
            skillBonus: check.skillBonus,
            total: check.total,
            target: check.target,
            outcome: check.outcome,
            intent: check.intent,
            // Carried so the transcript can show what a Family Move did, long
            // after the turn that spent it.
            ...(check.move ? { move: check.move } : {}),
          },
        },
      });
    }

    await tx.turnEvent.create({
      data: { sceneId: scene.id, ordinal: ordinal++, type: "NARRATION", content: result.narration.trim() },
    });

    // Growth is announced, not just recorded. A number quietly ticking up in a
    // database is not a reward; being told "Mira reached level 2" is.
    const milestones: string[] = [];

    // Experience for anyone who rolled. Level is always derived, never set.
    const xpByCharacter = new Map<string, number>();
    for (const check of result.checks) {
      xpByCharacter.set(check.characterId, (xpByCharacter.get(check.characterId) ?? 0) + xpForOutcome(check.outcome));
    }
    for (const [characterId, gained] of xpByCharacter) {
      const character = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
      const xp = character.xp + gained;
      const level = levelFor(xp);
      await tx.character.update({ where: { id: characterId }, data: { xp, level } });

      if (level > character.level) {
        // Said with what it buys, because "reached level 3" on its own was
        // exactly the announcement that used to mean nothing.
        milestones.push(
          `${character.name} reached level ${level}! There is something new waiting on her sheet.`,
        );
      }
    }

    // A skill improves because it was used, whatever the dice said.
    for (const check of result.checks) {
      if (!check.skillName) continue;

      const skill = await tx.characterSkill.findUnique({
        where: { characterId_name: { characterId: check.characterId, name: check.skillName } },
      });
      if (!skill) continue;

      const skillXp = skill.xp + SKILL_XP_PER_USE;
      const rank = skillRankFor(skillXp);
      await tx.characterSkill.update({ where: { id: skill.id }, data: { xp: skillXp, rank } });

      if (rank > skill.rank) {
        milestones.push(`${check.characterName} is getting really good at ${skill.name} — rank ${rank}.`);
      }
    }

    // What she has been trying, whether or not anything on her sheet covers it.
    //
    // This is the half that was missing. A girl who says "I climb the
    // drainpipe" with no climbing skill used to roll, earn experience toward
    // her level, and gain nothing that would make climbing easier next time —
    // the attempt was forgotten the moment the dice landed. Now it is counted,
    // and four of them make her someone who climbs.
    //
    // Counted regardless of the outcome, deliberately: a child who has failed
    // to pick a lock four times has learned a great deal about locks.
    for (const check of result.checks) {
      if (!check.practice) continue;

      const key = practiceKey(check.practice);
      if (key.length < 3) continue;

      const label = check.practice.trim().toLocaleLowerCase().slice(0, 30);

      const practice = await tx.practice.upsert({
        where: { characterId_key: { characterId: check.characterId, key } },
        create: { characterId: check.characterId, key, label, attempts: 1 },
        update: { attempts: { increment: 1 } },
      });

      const skills = await tx.characterSkill.findMany({
        where: { characterId: check.characterId },
        select: { name: true, rank: true },
      });

      // A Fast Learner has room for more than everybody else, which is the
      // whole of what that knack buys.
      const room =
        MAX_SKILLS +
        extraSkillRoom(
          (
            await tx.characterKnack.findMany({
              where: { characterId: check.characterId },
              select: { key: true },
            })
          ).map((knack) => knack.key),
        );
      if (!readyToLearn(practice, skills, room)) continue;

      const name = skillNameFrom(practice.label);
      await tx.characterSkill.create({
        data: { characterId: check.characterId, name, rank: 1, xp: 0 },
      });
      await tx.practice.update({
        where: { id: practice.id },
        data: { learnedAtTurn: turnCounter },
      });

      milestones.push(learnedMessage(check.characterName, practice.label));
    }

    // Bonds, from moments the extraction identified.
    for (const moment of result.extraction.bondMoments) {
      const from = campaign.party.find((member) => member.character.name === moment.from)?.characterId;
      const to = campaign.party.find((member) => member.character.name === moment.to)?.characterId;
      if (!from || !to) continue;

      const [a, b] = from < to ? [from, to] : [to, from];
      const existing = await tx.relationship.findUnique({
        where: { characterAId_characterBId: { characterAId: a, characterBId: b } },
      });
      // Only deepens ties the family already declared; the Game Master does not
      // get to invent relatives.
      if (!existing) continue;

      const bondXp = existing.bondXp + 1;
      const bondLevel = bondLevelFor(bondXp);
      await tx.relationship.update({
        where: { id: existing.id },
        data: { bondXp, bondLevel },
      });

      const unlocked = movesUnlockedBetween(existing.bondLevel, bondLevel);
      for (const move of unlocked) {
        milestones.push(
          `${moment.from} and ${moment.to} can now use ${move.name} together — ${move.blurb}`,
        );
      }
    }

    // Items the party is now carrying.
    for (const item of result.extraction.itemsGained) {
      const characterId = campaign.party.find(
        (member) => member.character.name === item.character,
      )?.characterId;
      if (!characterId) continue;

      // Picking up a second rope should raise the count, not create a duplicate.
      const already = await tx.inventoryItem.findUnique({
        where: { characterId_name: { characterId, name: item.name } },
      });

      await tx.inventoryItem.upsert({
        where: { characterId_name: { characterId, name: item.name } },
        create: {
          characterId,
          name: item.name,
          description: item.description ?? null,
          foundInCampaignId: campaign.id,
          requiresSkill: item.requiresSkill ?? null,
          requiresRank: item.requiresRank ?? null,
        },
        update: { quantity: { increment: 1 } },
      });

      milestones.push(
        already
          ? `${item.character} picks up another ${item.name}.`
          : item.requiresSkill
            ? `${item.character} is now carrying: ${item.name} — but cannot use it yet. That will take ${item.requiresSkill}.`
            : `${item.character} is now carrying: ${item.name}`,
      );
    }

    // Spend the Family Move only once the turn has actually committed.
    if (validMove && familyMove) {
      await tx.familyMoveUse.create({
        data: {
          campaignId: campaign.id,
          sceneId: scene.id,
          relationshipId: validMove.relationshipId,
          moveKey: familyMove.key,
          usedAtTurn: turnCounter,
        },
      });
    }

    // Acts are 1-based, so the final one sits at `length`. This once compared
    // against `length - 1`, which ended every three-chapter storyline after the
    // second — the last chapter was never played and its quest never opened.
    const isFinalAct = campaign.currentActIndex >= campaign.storyline.acts.length;
    const advancesAct = result.extraction.actComplete && !isFinalAct;
    const finishes = result.extraction.actComplete && isFinalAct;
    campaignComplete = finishes;

    // Quests come after the items, because finding the last thing a chapter
    // asked for is what finishes it — and before the announcements, because
    // finishing it is the thing most worth announcing.
    milestones.push(
      ...(await advanceQuests(tx, {
        campaignId: campaign.id,
        party: campaign.party.map((member) => ({
          characterId: member.characterId,
          characterName: member.character.name,
        })),
        turn: turnCounter,
        deedsDone: result.extraction.deedsDone,
        questsOpened: result.extraction.questsOpened,
        actComplete: result.extraction.actComplete,
        act: campaign.storyline.acts.find((act) => act.index === campaign.currentActIndex),
        nextAct: advancesAct
          ? campaign.storyline.acts.find((act) => act.index === campaign.currentActIndex + 1)
          : undefined,
      })),
    );

    // The next chapter's personal aims open only after all that has settled.
    // Opened any earlier they would be in the list `advanceQuests` just walked,
    // and an aim for a chapter nobody has played yet could be ticked off — and
    // finished — by something already in her pocket.
    if (advancesAct && nextAct) {
      await openPersonalQuests(
        tx,
        campaign.id,
        nextAct.index,
        nextAims,
        campaign.party.map((member) => ({
          characterId: member.characterId,
          characterName: member.character.name,
        })),
        turnCounter,
      );
    }

    for (const milestone of milestones) {
      await tx.turnEvent.create({
        data: { sceneId: scene.id, ordinal: ordinal++, type: "SYSTEM", content: milestone },
      });
    }

    // Memories, de-duplicated on (kind, key) so a recurring NPC updates rather
    // than accumulating near-identical rows.
    for (const memory of result.extraction.memories) {
      await tx.memory.upsert({
        where: {
          campaignId_kind_key: { campaignId: campaign.id, kind: memory.kind, key: memory.key },
        },
        create: {
          campaignId: campaign.id,
          kind: memory.kind,
          key: memory.key,
          content: memory.content,
          importance: memory.importance,
          lastSeenAt: turnCounter,
        },
        update: { content: memory.content, importance: memory.importance, lastSeenAt: turnCounter },
      });
    }

    if (result.extraction.location || result.extraction.sceneTitle) {
      await tx.scene.update({
        where: { id: scene.id },
        data: {
          ...(result.extraction.location ? { location: result.extraction.location } : {}),
          ...(result.extraction.sceneTitle ? { title: result.extraction.sceneTitle } : {}),
        },
      });
    }

    if (finishes) {
      await tx.turnEvent.create({
        data: {
          sceneId: scene.id,
          ordinal: ordinal++,
          type: "SYSTEM",
          content: `${campaign.storyline.title} is complete. What a journey.`,
        },
      });

      // The people worth remembering come home with the party.
      //
      // Done at the ending rather than as they are met, because an adventure is
      // the unit that decides who mattered: somebody introduced in chapter one
      // and never seen again is a walk-on, and only by the end is that clear.
      const remembered = await tx.memory.findMany({
        where: { campaignId: campaign.id, kind: "NPC" },
        select: { key: true, content: true, importance: true },
      });

      const coming = whoComesHome(remembered);
      const names: string[] = [];

      for (const npc of coming) {
        const key = acquaintanceKey(npc.key);

        for (const member of campaign.party) {
          // Upsert rather than create: meeting somebody again on a later
          // adventure raises the count instead of making a second stranger.
          await tx.acquaintance.upsert({
            where: { characterId_key: { characterId: member.characterId, key } },
            create: {
              characterId: member.characterId,
              key,
              name: npc.key,
              about: npc.content,
              metInCampaignId: campaign.id,
              metInCampaignTitle: campaign.title,
              timesMet: 1,
            },
            update: { timesMet: { increment: 1 }, about: npc.content },
          });
        }

        names.push(npc.key);
      }

      if (names.length > 0) {
        await tx.turnEvent.create({
          data: {
            sceneId: scene.id,
            ordinal: ordinal++,
            type: "SYSTEM",
            content: metMessage(names),
          },
        });
      }
    }

    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        turnCounter,
        lastPlayedAt: new Date(),
        ...(advancesAct ? { currentActIndex: campaign.currentActIndex + 1 } : {}),
        ...(finishes ? { status: "COMPLETE" as const, completedAt: new Date() } : {}),
      },
    });
  });

  await logAiCalls(
    campaign.id,
    records,
    result.diagnostics.adjudicationRepairs + result.diagnostics.extractionRepairs,
  );

  // Closing a scene compresses its turns so they stop costing context. Done
  // after the transaction because it needs another model call, and failing to
  // summarise must not roll back a turn that already happened.
  if (result.extraction.sceneComplete) {
    await closeScene(campaign.id, scene.id, config, calls).catch(() => {});
  }

  return { ...result, campaignComplete };
}

/** Summarises a scene and, unless the story is over, opens the next one. */
async function closeScene(campaignId: string, sceneId: string, config: AiConfig, calls: ModelCalls) {
  const scene = await db.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: { turns: { orderBy: { ordinal: "asc" } } },
  });

  const transcript = scene.turns
    .filter((turn) => turn.type === "NARRATION" || turn.type === "PLAYER_ACTION")
    .map((turn) => turn.content)
    .join("\n\n")
    .slice(0, 8000);

  let summary = "";
  try {
    const result = await requestStructured({
      call: (hint) => calls.json(summaryPrompt({ sceneTitle: scene.title, transcript }), hint),
      validate: validator(summarySchema),
    });
    summary = result.value.summary;
  } catch {
    // A crude summary is far better than none: without one, the whole scene
    // vanishes from the Game Master's memory when it closes.
    summary = transcript.slice(0, 600);
  }

  await db.$transaction(async (tx) => {
    await tx.scene.update({
      where: { id: sceneId },
      data: { status: "CLOSED", summary, closedAt: new Date() },
    });

    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });

    // A finished adventure gets no next chapter. Opening one would leave an
    // empty scene hanging after the ending, waiting for a turn nobody is
    // going to take.
    if (campaign.status === "COMPLETE") return;

    await tx.scene.create({
      data: {
        campaignId,
        index: scene.index + 1,
        title: "…",
        actIndex: campaign.currentActIndex,
        location: scene.location,
      },
    });
  });
}


/**
 * A turn where the party talks instead of acting.
 *
 * One model call rather than three: no adjudication, no dice, no extraction,
 * and the turn counter does not move. Nothing was attempted, so nothing can
 * succeed or fail, and treating a conversation as a turn would quietly spend
 * the party's Family Moves and advance the act on a chat.
 *
 * It is still snapshotted, so it can be taken back like any other turn.
 */
export async function talkTurn(
  campaignId: string,
  userId: string,
  said: PlayerAction[],
  onProgress?: (event: TurnProgress) => void,
) {
  const campaign = await loadCampaign(campaignId, userId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "ACTIVE") throw new Error("This adventure is not in progress.");

  const scene = campaign.scenes.find((entry) => entry.status === "OPEN");
  if (!scene) throw new Error("There is no open scene.");

  const spoken = said
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => line.text.length > 0);
  if (spoken.length === 0) throw new Error("Nobody said anything.");

  const config = await resolveAiConfig();
  const records: AiCallRecord[] = [];
  const calls = modelCalls(config, (record) => records.push(record));

  const built = await buildCampaignContext(campaign, config.maxContextTokens);
  const lastNarration = await db.turnEvent.findFirst({
    where: { sceneId: scene.id, type: "NARRATION" },
    orderBy: { ordinal: "desc" },
  });

  const named = spoken.map((line) => ({
    character:
      campaign.party.find((member) => member.characterId === line.characterId)?.character.name ??
      "Someone",
    text: line.text,
  }));

  onProgress?.({ type: "stage", stage: "narrating" });

  const system = systemPrompt({
    tone: campaign.tone as ToneKey,
    readingLevel: campaign.readingLevel as ReadingLevelKey,
  });

  let reply = await calls.prose(system, conversationPrompt({ context: built.text, said: named }));

  // The same guard the storyteller's other prose passes through. A quieter
  // moment is not a safer one.
  const verdict = checkNarration(reply);
  if (!verdict.ok) {
    reply = await calls.prose(
      `${system}\n\n${safetyReminder(verdict.matched)}`,
      conversationPrompt({ context: built.text, said: named }),
    );
  }

  const narration = reply.trim();

  await db.$transaction(async (tx) => {
    let ordinal = await nextOrdinal(scene.id);

    const snapshot = await captureSnapshot(
      tx,
      campaign.id,
      campaign.party.map((member) => member.characterId),
    );
    await tx.turnSnapshot.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        turnCounter: campaign.turnCounter,
        fromOrdinal: ordinal,
        state: snapshot as unknown as Prisma.InputJsonValue,
      },
      update: {
        turnCounter: campaign.turnCounter,
        fromOrdinal: ordinal,
        state: snapshot as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });

    for (const line of spoken) {
      await tx.turnEvent.create({
        data: {
          sceneId: scene.id,
          ordinal: ordinal++,
          type: "PLAYER_ACTION",
          actorCharacterId: line.characterId,
          content: line.text,
          // Marks it as speech rather than an attempt, so the transcript can
          // show it as talk and the Game Master reads it back as talk.
          metadata: { spoken: true },
        },
      });
    }

    await tx.turnEvent.create({
      data: { sceneId: scene.id, ordinal: ordinal++, type: "NARRATION", content: narration },
    });

    await tx.campaign.update({
      where: { id: campaign.id },
      data: { lastPlayedAt: new Date() },
    });
  });

  await logAiCalls(campaign.id, records, 0);

  return { narration };
}

/**
 * Three things a character might try, for a player who has gone blank.
 *
 * Read-only: it writes nothing but the debug log, so a child can press it as
 * often as they like without touching the story.
 */
export async function suggestActions(campaignId: string, userId: string, characterId: string) {
  const campaign = await loadCampaign(campaignId, userId);
  if (!campaign) throw new Error("Campaign not found.");

  const member = campaign.party.find((entry) => entry.characterId === characterId);
  if (!member) throw new Error("That adventurer is not on this journey.");

  const scene = campaign.scenes.find((entry) => entry.status === "OPEN");
  const lastNarration = scene
    ? await db.turnEvent.findFirst({
        where: { sceneId: scene.id, type: "NARRATION" },
        orderBy: { ordinal: "desc" },
      })
    : null;

  const config = await resolveAiConfig();
  const calls = modelCalls(config);

  const character = member.character;
  const summary =
    `${character.race} ${character.archetype}, ` +
    `Might ${character.might} Wits ${character.wits} Heart ${character.heart} Spark ${character.spark}` +
    (character.skills.length > 0
      ? `, good at ${character.skills.map((skill) => skill.name).join(", ")}`
      : "");

  const result = await requestStructured({
    call: (hint) =>
      calls.json(
        suggestionPrompt({
          sceneText: lastNarration?.content ?? campaign.storyline.hook,
          characterName: character.name,
          characterSummary: summary,
        }),
        hint,
      ),
    validate: validator(suggestionsSchema),
  });

  return result.value.suggestions.slice(0, 3);
}

/**
 * Marks where a play session stopped.
 *
 * Two children playing weekly lose the thread between sessions, and "what
 * happened last time?" is much easier to answer when the transcript says where
 * last time ended.
 */
export async function markStoppingPoint(campaignId: string, userId: string) {
  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(campaignId, userId),
    include: { scenes: { where: { status: "OPEN" }, take: 1 } },
  });
  if (!campaign) throw new Error("Campaign not found.");

  const scene = campaign.scenes[0];
  if (!scene) throw new Error("There is no open scene.");

  const when = new Date();
  await db.turnEvent.create({
    data: {
      sceneId: scene.id,
      ordinal: await nextOrdinal(scene.id),
      type: "SYSTEM",
      content: `The family stopped here on ${when.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}.`,
      // Kept in metadata rather than a new event type: the transcript needs to
      // style it differently, and a nullable flag is a cheaper thing to add
      // than an enum value every existing row has to be reasoned about against.
      metadata: { bookmark: true, at: when.toISOString() },
    },
  });

  await db.campaign.update({ where: { id: campaignId }, data: { lastPlayedAt: when } });
}
