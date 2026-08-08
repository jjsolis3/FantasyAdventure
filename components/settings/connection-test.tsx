"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";

type Result = {
  config?: { kind: string; baseUrl: string; model: string; narrationModel: string; hasApiKey: boolean };
  reach?: { ok: boolean; latencyMs: number; reply: string };
  turn?: {
    narration: string;
    checks: { characterName: string; stat: string; roll: number; total: number; target: number; outcome: string }[];
    elapsedMs: number;
    words: number;
    problems: string[];
  };
  error?: string;
};

async function consume(response: Response, onEvent: (event: string, data: Record<string, unknown>) => void) {
  if (!response.body) throw new Error("The server sent no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      let name = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length === 0) continue;
      try {
        onEvent(name, JSON.parse(data.join("\n")));
      } catch {
        // A malformed frame is not worth failing the test over.
      }
    }
  }
}

export function ConnectionTest({
  lastTestedAt,
  lastTestOk,
  lastTestNote,
}: {
  lastTestedAt: Date | string | null;
  lastTestOk: boolean | null;
  lastTestNote: string | null;
}) {
  const [running, setRunning] = useState<false | "quick" | "deep">(false);
  const [step, setStep] = useState("");
  const [result, setResult] = useState<Result>({});

  async function run(deep: boolean) {
    setRunning(deep ? "deep" : "quick");
    setResult({});
    setStep("Starting…");

    try {
      const response = await fetch("/api/settings/storyteller/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deep }),
      });
      if (!response.ok) throw new Error(`The server replied ${response.status}.`);

      await consume(response, (event, data) => {
        if (event === "step") setStep(String(data.label));
        else if (event === "progress") {
          const stage = String((data as { stage?: string }).stage ?? "");
          if (stage) setStep(`Practice turn — ${stage}…`);
        } else if (event === "config") setResult((r) => ({ ...r, config: data as Result["config"] }));
        else if (event === "reach") setResult((r) => ({ ...r, reach: data as Result["reach"] }));
        else if (event === "turn") setResult((r) => ({ ...r, turn: data as Result["turn"] }));
        else if (event === "error") setResult((r) => ({ ...r, error: String(data.message) }));
      });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setRunning(false);
      setStep("");
    }
  }

  return (
    <div className="rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-6">
      <h2 className="font-display mb-1 text-xl text-hearth-100">Test the connection</h2>
      <p className="mb-4 text-sm text-hearth-400">
        A quick check says whether the storyteller answers. The practice turn is the one that
        matters — it runs the real four-step pipeline and reports anything that would break a game.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={running !== false}
          onClick={() => run(false)}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-50"
        >
          {running === "quick" ? "Checking…" : "Quick check"}
        </button>
        <button
          type="button"
          disabled={running !== false}
          onClick={() => run(true)}
          className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-50"
        >
          {running === "deep" ? "Running…" : "Run a practice turn"}
        </button>
      </div>

      {running !== false ? (
        <p className="mt-4 flex items-center gap-3 text-hearth-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-hearth-400" />
          {step}
        </p>
      ) : null}

      {!running && lastTestedAt && !result.reach && !result.error ? (
        <p className={`mt-4 text-sm ${lastTestOk ? "text-moss-400" : "text-red-300"}`}>
          Last tested {new Date(lastTestedAt).toLocaleString()} — {lastTestNote}
        </p>
      ) : null}

      {result.error ? (
        <div className="mt-4">
          <Alert>{result.error}</Alert>
        </div>
      ) : null}

      {result.config ? (
        <dl className="mt-5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-hearth-400">Address: </dt>
            <dd className="inline text-hearth-200">{result.config.baseUrl}</dd>
          </div>
          <div>
            <dt className="inline text-hearth-400">Model: </dt>
            <dd className="inline text-hearth-200">{result.config.model}</dd>
          </div>
          {result.config.narrationModel !== result.config.model ? (
            <div>
              <dt className="inline text-hearth-400">Narration: </dt>
              <dd className="inline text-hearth-200">{result.config.narrationModel}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline text-hearth-400">API key: </dt>
            <dd className="inline text-hearth-200">{result.config.hasApiKey ? "set" : "none"}</dd>
          </div>
        </dl>
      ) : null}

      {result.reach ? (
        <p className="mt-4 text-sm text-moss-400">
          Answered in {result.reach.latencyMs}ms — “{result.reach.reply}”
        </p>
      ) : null}

      {result.turn ? (
        <div className="mt-5 space-y-4">
          {result.turn.problems.length === 0 ? (
            <Alert tone="success">
              Ran a full turn in {Math.round(result.turn.elapsedMs / 1000)}s with no problems. This
              storyteller is ready.
            </Alert>
          ) : (
            <Alert>
              <span className="font-medium">Worth knowing before you play:</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.turn.problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </Alert>
          )}

          {result.turn.checks.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                Dice it asked for
              </h3>
              <ul className="space-y-0.5 text-sm text-hearth-200/80">
                {result.turn.checks.map((check, index) => (
                  <li key={index}>
                    {check.characterName} · {check.stat} · rolled {check.roll}, total {check.total} vs{" "}
                    {check.target} → {check.outcome}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="mb-1 text-sm font-medium tracking-wide text-hearth-400 uppercase">
              What it wrote ({result.turn.words} words)
            </h3>
            <p className="leading-relaxed whitespace-pre-wrap text-hearth-100">
              {result.turn.narration}
            </p>
            <p className="mt-2 text-sm text-hearth-400">
              Read this as though you were ten. If it is flat or repetitive, that is the model, not
              the game.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
