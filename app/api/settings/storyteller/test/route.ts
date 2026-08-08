import { db } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/session";
import { chat } from "@/lib/ai/provider";
import { SETTINGS_ID, resolveAiConfig } from "@/lib/ai/settings";
import { modelCalls } from "@/lib/engine/play";
import { runTurn } from "@/lib/engine/gm";
import { buildContext } from "@/lib/ai/context";
import type { StatKey } from "@/lib/game/rules";

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

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
        send("step", { step: "reach", label: "Saying hello…" });
        const started = Date.now();
        const reply = await chat(config, {
          messages: [{ role: "user", content: "Reply with the single word: ready" }],
          maxTokens: 10,
          temperature: 0,
        });
        const latency = Date.now() - started;
        send("reach", { ok: true, latencyMs: latency, reply: reply.trim().slice(0, 120) });

        if (!body.deep) {
          await record(true, `Reachable in ${latency}ms.`);
          send("done", { ok: true });
          return;
        }

        // ---- A real turn ---------------------------------------------------
        send("step", { step: "turn", label: "Running a practice turn…" });

        const party = [
          {
            id: "mira",
            name: "Mira",
            stats: { might: 1, wits: 3, heart: 5, spark: 3 } as Record<StatKey, number>,
            skills: [{ name: "Speak with Animals", rank: 1 }],
          },
          {
            id: "rowan",
            name: "Rowan",
            stats: { might: 5, wits: 3, heart: 3, spark: 1 } as Record<StatKey, number>,
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        await record(false, message);
        send("error", { message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
