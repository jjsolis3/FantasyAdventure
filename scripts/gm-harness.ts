/**
 * Runs one Game Master turn against a real model server and prints every
 * stage, so prompts can be tuned and models compared without clicking through
 * the app.
 *
 *   AI_BASE_URL=http://192.168.1.50:11434/v1 AI_MODEL=qwen2.5:latest \
 *     npx tsx scripts/gm-harness.ts
 *
 * Compare two models on the same turn:
 *   AI_MODEL=phi3:latest      npx tsx scripts/gm-harness.ts
 *   AI_MODEL=qwen2.5:latest   npx tsx scripts/gm-harness.ts
 *
 * Touches no database and needs no running app.
 */

import "dotenv/config";
import { buildContext } from "../lib/ai/context.ts";
import { probe, readAiConfig } from "../lib/ai/provider.ts";
import { runTurn, type TurnInput } from "../lib/engine/gm.ts";
import { modelCalls, type AiCallRecord } from "../lib/engine/play.ts";
import type { StatKey } from "../lib/game/rules.ts";

const rule = "─".repeat(72);

function section(title: string) {
  console.log(`\n${rule}\n${title}\n${rule}`);
}

const party = [
  {
    id: "mira",
    name: "Mira Thistledown",
    stats: { might: 1, wits: 3, heart: 5, spark: 3 } as Record<StatKey, number>,
    skills: [{ name: "Speak with Animals", rank: 1 }],
  },
  {
    id: "rowan",
    name: "Rowan",
    stats: { might: 5, wits: 3, heart: 3, spark: 1 } as Record<StatKey, number>,
    skills: [{ name: "Hold Fast", rank: 1 }],
  },
];

const built = buildContext({
  campaignTitle: "The Naming Flight",
  storylineTitle: "The Dragon Who Lost Her Name",
  premise:
    "A half-grown dragon has crash-landed in the valley with no memory of her name, and her " +
    "clan's Naming Flight is in four days.",
  actTitle: "The Dragon in the Barley",
  actGoal:
    "Earn the dragon's trust. She is proud, frightened, and certain the family will hand her " +
    "over to her clan.",
  actBeats: [
    "She can breathe fire but flinches when she does",
    "Her scales change colour with her mood and she hates that everyone can tell",
  ],
  party: party.map((member) => ({
    name: member.name,
    race: member.id === "mira" ? "Halfling" : "Human",
    archetype: member.id === "mira" ? "Beastfriend" : "Guardian",
    pronouns: member.id === "mira" ? "she/her" : "he/him",
    ageBand: member.id === "mira" ? "CHILD" : "GROWNUP",
    description: member.id === "mira" ? "Freckles and a too-big coat." : "Quiet, and always first through a door.",
    level: 1,
    stats: member.stats,
    skills: member.skills,
  })),
  bonds: [{ from: "Mira Thistledown", to: "Rowan", kind: "SIBLING", level: 0 }],
  location: "the barley field behind the farmhouse",
  sceneSummary: null,
  priorScenes: [],
  memories: [
    {
      kind: "NPC",
      key: "the dragon",
      content: "A half-grown dragon, pony-sized, will not say what she is called.",
      importance: 5,
      lastSeenAt: 0,
    },
  ],
  recentTurns: [
    {
      type: "NARRATION",
      content:
        "The sound is enormous and then, suddenly, very small. In the wreck of the barley sits a " +
        "dragon the size of a pony, wings folded wrong. 'Don't,' she says. 'Don't ask me what I'm called.'",
    },
  ],
  currentTurnCounter: 1,
  maxTokens: 3000,
});

const input: TurnInput = {
  context: built.text,
  tone: "ADVENTUROUS",
  readingLevel: "MIDDLE_GRADE",
  sceneText:
    "A dragon the size of a pony sits in the wrecked barley, wings folded wrong, refusing to say her name.",
  party,
  actions: [
    { characterId: "mira", text: "I sit down in the barley a little way off and start humming, like I do with the goats." },
    { characterId: "rowan", text: "I try to lift the fence post that fell on her wing." },
  ],
};

async function main() {
  const config = readAiConfig();

  section("CONFIGURATION");
  console.log(`base URL          ${config.baseUrl}`);
  console.log(`model (JSON)      ${config.model}`);
  console.log(`model (narration) ${config.narrationModel}`);
  console.log(`context budget    ${config.maxContextTokens} tokens`);
  console.log(`timeout           ${config.timeoutMs}ms`);

  section("REACHABILITY");
  const reachable = await probe(config);
  console.log(reachable.ok ? `ok — replied "${reachable.detail}"` : `FAILED — ${reachable.detail}`);
  if (!reachable.ok) process.exit(1);

  section("ASSEMBLED CONTEXT");
  console.log(`${built.estimatedTokens} estimated tokens, trimmed:`, built.trimmed);
  console.log(`\n${built.text}`);

  section("WHAT THE PLAYERS DID");
  for (const action of input.actions) {
    const name = party.find((member) => member.id === action.characterId)?.name;
    console.log(`${name}: ${action.text}`);
  }

  const records: AiCallRecord[] = [];
  const calls = modelCalls(config, (record) => records.push(record));

  const started = Date.now();
  const result = await runTurn(input, calls);
  const elapsed = Date.now() - started;

  section("STAGE 1 — ADJUDICATION");
  console.log(JSON.stringify(result.adjudication, null, 2));

  section("STAGE 2 — DICE (rolled by the server, not the model)");
  if (result.checks.length === 0) {
    console.log("No checks were called for.");
  } else {
    for (const check of result.checks) {
      console.log(
        `${check.characterName}: ${check.stat} vs ${check.difficulty} — ` +
          `rolled ${check.roll} + ${check.modifier + check.skillBonus} = ${check.total} ` +
          `vs ${check.target} → ${check.outcome}`,
      );
    }
  }

  section("STAGE 3 — NARRATION");
  console.log(result.narration);

  section("STAGE 4 — EXTRACTION");
  console.log(JSON.stringify(result.extraction, null, 2));

  section("DIAGNOSTICS");
  console.log(result.diagnostics);
  console.log(`\ntotal ${elapsed}ms across ${records.length} model calls:`);
  for (const record of records) {
    console.log(
      `  ${record.stage.padEnd(9)} ${record.model.padEnd(22)} ${String(record.latencyMs).padStart(6)}ms  ` +
        `${record.ok ? "ok" : `FAILED: ${record.error}`}`,
    );
  }

  // The things most likely to be wrong with a small model, called out plainly.
  section("VERDICT");
  const warnings: string[] = [];
  if (result.diagnostics.adjudicationFellBack) {
    warnings.push("Adjudication failed entirely — this model could not produce usable JSON. Dice were skipped.");
  }
  if (result.diagnostics.extractionFellBack) {
    warnings.push("Extraction failed — nothing would have been remembered from this turn.");
  }
  if (result.diagnostics.adjudicationRepairs > 0 || result.diagnostics.extractionRepairs > 0) {
    warnings.push(
      `Needed ${result.diagnostics.adjudicationRepairs + result.diagnostics.extractionRepairs} repair call(s). ` +
        "Workable, but slower and less reliable than a model that gets it right first time.",
    );
  }
  if (result.diagnostics.safetyRegenerated) {
    warnings.push("Narration tripped the safety guard and had to be regenerated.");
  }
  const words = result.narration.trim().split(/\s+/).length;
  if (words < 60) {
    warnings.push(`Narration was only ${words} words — thin for a middle-grade table.`);
  }

  console.log(warnings.length === 0 ? "Clean run. This model handled every stage first time." : warnings.map((w) => `- ${w}`).join("\n"));
}

main().catch((error) => {
  console.error("\nHarness failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
