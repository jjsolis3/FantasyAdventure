/**
 * Wires the Game Master pipeline to the database.
 *
 * Everything the model sees is loaded here, and everything it produces is
 * committed here. The pipeline itself (lib/engine/gm.ts) stays free of
 * persistence so it can be tested without a database or a model server.
 */

import { db } from "@/lib/db";
import { buildContext, type MemoryContext, type TurnContext } from "@/lib/ai/context";
import { openingPrompt, summaryPrompt, systemPrompt, type ReadingLevelKey, type ToneKey } from "@/lib/ai/prompts";
import { summarySchema, validator } from "@/lib/ai/schemas";
import { requestStructured } from "@/lib/ai/json";
import { chat, readAiConfig, type AiConfig } from "@/lib/ai/provider";
import { checkNarration, checkPlayerInput, IN_FICTION_DEFLECTION, safetyReminder } from "@/lib/ai/safety";
import { runTurn, type ModelCalls } from "@/lib/engine/gm";
import { xpForOutcome } from "@/lib/engine/dice";
import { bondLevelFor, kindFromPerspective, levelFor, type StatKey } from "@/lib/game/rules";

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

      try {
        const reply = await chat(config, {
          messages,
          // Structured output wants determinism, not flair.
          temperature: 0,
          json: true,
          maxTokens: 700,
        });
        onCall?.({ stage: "json", model: config.model, latencyMs: Date.now() - started, ok: true, prompt, reply });
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
      try {
        const reply = await chat(config, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          model: config.narrationModel,
          temperature: 0.85,
          maxTokens: 700,
        });
        onCall?.({
          stage: "narrate",
          model: config.narrationModel,
          latencyMs: Date.now() - started,
          ok: true,
          prompt,
          reply,
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
        promptPreview: record.prompt.slice(0, 2000),
        responsePreview: record.reply.slice(0, 2000),
      })),
    })
    .catch(() => {
      // Debug logging must never be the reason a turn fails.
    });
}

/** Loads a campaign with everything the prompt needs. */
async function loadCampaign(campaignId: string, userId: string) {
  return db.campaign.findFirst({
    where: { id: campaignId, ownerId: userId },
    include: {
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            include: {
              skills: true,
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

async function nextOrdinal(sceneId: string): Promise<number> {
  const last = await db.turnEvent.findFirst({
    where: { sceneId },
    orderBy: { ordinal: "desc" },
    select: { ordinal: true },
  });
  return (last?.ordinal ?? 0) + 1;
}

/**
 * Narrates the opening scene and moves the campaign to ACTIVE.
 *
 * Separate from `playTurn` because there are no player actions yet and nothing
 * to adjudicate — just the storyline's hook, turned into prose.
 */
export async function beginCampaign(campaignId: string, userId: string) {
  const campaign = await loadCampaign(campaignId, userId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "SETUP") throw new Error("This adventure has already begun.");
  if (campaign.party.length === 0) throw new Error("Nobody is in the party.");

  const config = readAiConfig();
  const records: AiCallRecord[] = [];
  const calls = modelCalls(config, (record) => records.push(record));

  const built = await buildCampaignContext(campaign, config.maxContextTokens);
  const system = systemPrompt({
    tone: campaign.tone as ToneKey,
    readingLevel: campaign.readingLevel as ReadingLevelKey,
  });

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

    return created;
  });

  await logAiCalls(campaign.id, records, 0);

  return { sceneId: scene.id, narration: narration.trim() };
}

export type PlayerAction = { characterId: string; text: string };

/** Runs one party turn and commits everything it produced. */
export async function playTurn(campaignId: string, userId: string, actions: PlayerAction[]) {
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

  const config = readAiConfig();
  const records: AiCallRecord[] = [];
  const calls = modelCalls(config, (record) => records.push(record));

  const built = await buildCampaignContext(campaign, config.maxContextTokens);

  const lastNarration = await db.turnEvent.findFirst({
    where: { sceneId: scene.id, type: "NARRATION" },
    orderBy: { ordinal: "desc" },
  });

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
      })),
      actions: accepted,
      deflectionNote: flagged ? IN_FICTION_DEFLECTION : null,
    },
    calls,
  );

  const turnCounter = campaign.turnCounter + 1;

  await db.$transaction(async (tx) => {
    let ordinal = await nextOrdinal(scene.id);

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
          },
        },
      });
    }

    await tx.turnEvent.create({
      data: { sceneId: scene.id, ordinal: ordinal++, type: "NARRATION", content: result.narration.trim() },
    });

    // Experience for anyone who rolled. Level is always derived, never set.
    const xpByCharacter = new Map<string, number>();
    for (const check of result.checks) {
      xpByCharacter.set(check.characterId, (xpByCharacter.get(check.characterId) ?? 0) + xpForOutcome(check.outcome));
    }
    for (const [characterId, gained] of xpByCharacter) {
      const character = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
      const xp = character.xp + gained;
      await tx.character.update({ where: { id: characterId }, data: { xp, level: levelFor(xp) } });
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
      await tx.relationship.update({
        where: { id: existing.id },
        data: { bondXp, bondLevel: bondLevelFor(bondXp) },
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

    const advancesAct =
      result.extraction.actComplete && campaign.currentActIndex < campaign.storyline.acts.length;

    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        turnCounter,
        lastPlayedAt: new Date(),
        ...(advancesAct ? { currentActIndex: campaign.currentActIndex + 1 } : {}),
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

  return result;
}

/** Summarises a scene and opens the next one. */
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
