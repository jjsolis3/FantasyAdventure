import { db } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/session";
import { chat } from "@/lib/ai/provider";
import { SETTINGS_ID, resolveAiConfig } from "@/lib/ai/settings";
import { modelCalls } from "@/lib/engine/play";
import { runTurn } from "@/lib/engine/gm";
import { buildContext } from "@/lib/ai/context";
import { sseResponse } from "@/lib/http/sse";
import { statBlock } from "@/lib/game/rules";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Tests the storyteller connection and streams the results back.
 *
 * Two depths, because "can we reach it" and "can it actually run the game" are
 * different questions and the second one is what matters. A model can answer a
 * one-word prompt perfectly and still be unable to produce usable JSON for
 * adjudication — which is precisely the failure that leaves a family with a
 * story that never remembers anything.
 *
 * Admin-only. This makes the server fetch a URL of the caller's choosing, which
 * on a self-hosted box the administrator already controls, but it is not
 * something a player should be able to do.
 */
export async function POST(request: Request) {
  const admin = await requireAdminForApi();
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => ({}))) as { deep?: boolean };

  return sseResponse(async (send) => {
    const record = async (ok: boolean, note: string) => {
      await db.aiSetting
        .update({
          where: { id: SETTINGS_ID },
          data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestNote: note.slice(0, 500) },
        })
        .catch(() => {
          // Settings may not be saved yet; the test still reports its result.
        });
    };

    try {
      {
        send("step", { step: "config", label: "Reading settings…" });
        const config = await resolveAiConfig();
        send("config", {
          kind: config.kind,
          baseUrl: config.baseUrl,
          model: config.model,
          narrationModel: config.narrationModel,
          hasApiKey: config.apiKey !== null,
        });

        // ---- Reachability -------------------------------------------------
        //
        // Both models, not just the first. When narration is routed to a
        // second model, a check that only greets the main one reports success
        // for a configuration that cannot finish a turn — the JSON stages
        // work, and the game dies at the narration step with a message about
        // a model nobody tested.
        const probes: { role: "main" | "narration"; model: string }[] = [
          { role: "main", model: config.model },
        ];
        if (config.narrationModel !== config.model) {
          probes.push({ role: "narration", model: config.narrationModel });
        }

        let slowest = 0;
        for (const probe of probes) {
          send("step", {
            step: `reach:${probe.role}`,
            label:
              probes.length === 1
                ? "Saying hello…"
                : `Saying hello to the ${probe.role === "main" ? "dice and memory" : "narration"} model…`,
          });

          const started = Date.now();
          try {
            const reply = await chat(config, {
              model: probe.model,
              messages: [{ role: "user", content: "Reply with the single word: ready" }],
              maxTokens: 10,
              temperature: 0,
            });
            const latency = Date.now() - started;
            slowest = Math.max(slowest, latency);
            send("reach", {
              role: probe.role,
              model: probe.model,
              ok: true,
              latencyMs: latency,
              reply: reply.trim().slice(0, 120),
            });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            send("reach", { role: probe.role, model: probe.model, ok: false, error: detail });

            const note =
              probe.role === "narration"
                ? `The narration model (${probe.model}) failed, even though ${config.model} answered. ${detail}`
                : detail;
            await record(false, note);
            send("error", { message: note });
            return;
          }
        }

        if (!body.deep) {
          const summary = probes.map((probe) => probe.model).join(" and ");
          await record(true, `${summary} reachable in ${slowest}ms.`);
          send("done", { ok: true });
          return;
        }

        // ---- A real turn ---------------------------------------------------
        send("step", { step: "turn", label: "Running a practice turn…" });

        const party = [
          {
            id: "mira",
            name: "Mira",
            // statBlock fills the stats not named here at the neutral value. The
            // previous `as` cast quietly left the newer stats undefined, so the
            // practice turn rolled NaN dice whenever the model picked one.
            stats: statBlock({ might: 1, wits: 3, heart: 5 }),
            skills: [{ name: "Speak with Animals", rank: 1 }],
          },
          {
            id: "rowan",
            name: "Rowan",
            stats: statBlock({ might: 5, spark: 1 }),
            skills: [],
          },
        ];

        const built = buildContext({
          campaignTitle: "A practice scene",
          storylineTitle: "The Star in Grandma's Garden",
          premise: "A small star has fallen into the vegetable patch and cannot get home.",
          actTitle: "The Glow in the Greens",
          actGoal: "Let the family meet the star and earn its trust.",
          actBeats: ["It hides under the runner beans and has to be coaxed, not grabbed"],
          party: party.map((member) => ({
            name: member.name,
            race: member.id === "mira" ? "Halfling" : "Human",
            archetype: member.id === "mira" ? "Beastfriend" : "Guardian",
            pronouns: member.id === "mira" ? "she/her" : "he/him",
            ageBand: member.id === "mira" ? "CHILD" : "GROWNUP",
            description: null,
            level: 1,
            stats: member.stats,
            skills: member.skills,
          })),
          bonds: [{ from: "Mira", to: "Rowan", kind: "SIBLING", level: 1 }],
          location: "the vegetable patch, just past bedtime",
          sceneSummary: null,
          priorScenes: [],
          memories: [],
          recentTurns: [
            {
              type: "NARRATION",
              content:
                "In the middle of the garden, sitting in a shallow dent in the soil, is a light " +
                "about the size of a cat — and it is humming a worried little tune.",
            },
          ],
          currentTurnCounter: 1,
          maxTokens: config.maxContextTokens,
        });

        const turnStarted = Date.now();
        const result = await runTurn(
          {
            context: built.text,
            tone: "COZY",
            readingLevel: "MIDDLE_GRADE",
            sceneText: "A small fallen star hums worriedly in the vegetable patch.",
            party,
            actions: [
              { characterId: "mira", text: "I sit down nearby and hum back to it, very quietly." },
              { characterId: "rowan", text: "I lift the fallen bean pole off the soil." },
            ],
          },
          modelCalls(config),
          undefined,
          (event) => send("progress", event),
        );

        const elapsed = Date.now() - turnStarted;

        // The verdict is the point of the deep test: these are the failures
        // that leave a family with a story that never remembers anything.
        const problems: string[] = [];
        if (result.diagnostics.adjudicationFellBack) {
          problems.push("Could not produce usable JSON for the dice — every turn would run without rolls.");
        }
        if (result.diagnostics.extractionFellBack) {
          problems.push("Could not extract what happened — nothing would ever be remembered.");
        }
        const repairs =
          result.diagnostics.adjudicationRepairs + result.diagnostics.extractionRepairs;
        if (repairs > 0) {
          problems.push(`Needed ${repairs} retry(s) to return valid JSON. Workable, but slower.`);
        }
        if (result.diagnostics.safetyRegenerated) {
          problems.push("Narration tripped the safety guard and had to be rewritten.");
        }
        const words = result.narration.trim().split(/\s+/).length;
        if (words < 60) {
          problems.push(`Narration was only ${words} words — thin for a middle-grade table.`);
        }

        send("turn", {
          narration: result.narration,
          checks: result.checks,
          extraction: result.extraction,
          diagnostics: result.diagnostics,
          elapsedMs: elapsed,
          words,
          problems,
        });

        const note =
          problems.length === 0
            ? `Ran a full turn in ${Math.round(elapsed / 1000)}s with no problems.`
            : problems.join(" ");
        await record(problems.length === 0, note);
        send("done", { ok: problems.length === 0 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      await record(false, message);
      send("error", { message });
    }
  });
}
