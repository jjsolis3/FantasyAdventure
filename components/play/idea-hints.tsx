"use client";

import { useState } from "react";
import type { KnownFact } from "@/lib/game/briefing";

/**
 * "I don't know what to do" — in two steps, and neither of them types for her.
 *
 * This button used to fetch three ready-made actions and drop the chosen one
 * straight into the text box, and the girls found what any nine-year-old would
 * find: it was the fastest way through the game. The description that stuck was
 * *"that is like using a clue while actively trying to complete an escape room
 * — it is good to use clues, but not if you want a good score."*
 *
 * So there are two rungs now, and the first one is free:
 *
 *   1. **What is in front of you.** No model call, no waiting, nothing new —
 *      the things this passage put within reach and the facts the party already
 *      collected, restated. Most of the time being stuck is just having lost
 *      the thread of a long passage, and this is the whole cure.
 *   2. **A nudge.** Only if she asks again. Three things somebody at the table
 *      has noticed and not followed up — pointed at, never acted on.
 *
 * And the nudges are text, not buttons. Nothing here fills the box. She reads
 * it, decides what to do about it, and writes it herself, which is the part of
 * the evening worth having.
 *
 * Shared by the shared-screen prompt and the own-device round board, because a
 * child stuck for an idea is stuck the same way on either.
 */
export function IdeaHints({
  campaignId,
  characterId,
  onTheTable,
  known,
}: {
  campaignId: string;
  characterId: string;
  /** Things this passage put within reach. The free first rung. */
  onTheTable?: string[];
  /** What the party has learned. Also free. */
  known?: KnownFact[];
}) {
  const [step, setStep] = useState<"shut" | "recap" | "nudges">("shut");
  const [nudges, setNudges] = useState<string[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [noIdeas, setNoIdeas] = useState("");

  const table = onTheTable ?? [];
  const facts = known ?? [];
  const hasRecap = table.length > 0 || facts.length > 0;

  async function askForNudges() {
    setThinking(true);
    setNoIdeas("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = (await response.json()) as { suggestions?: string[] };
      if (!response.ok || !data.suggestions?.length) {
        // Deliberately not the server's own message. What comes back from a
        // storyteller that has fallen over is a sentence about JSON, and the
        // person reading this screen is nine.
        setNoIdeas("No nudges just now — but anything you type will work.");
        return;
      }
      setNudges(data.suggestions);
      setStep("nudges");
    } catch {
      setNoIdeas("No nudges just now — but anything you type will work.");
    } finally {
      setThinking(false);
    }
  }

  // Straight to the model when there is nothing to recap — a first turn, or a
  // passage that put nothing new within reach. Making her press twice for an
  // empty box would be a rule enforced on the wrong person.
  function begin() {
    if (hasRecap) setStep("recap");
    else void askForNudges();
  }

  if (step === "shut") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={begin}
          disabled={thinking}
          className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-50"
        >
          {thinking ? "Thinking…" : "I don't know what to do"}
        </button>
        {noIdeas ? <p className="text-sm text-hearth-500">{noIdeas}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hearth-800/70 bg-hearth-950/40 p-3">
      {step === "recap" ? (
        <>
          <p className="text-sm text-hearth-300">Here is where you are.</p>

          {table.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {table.map((thing) => (
                <li
                  key={thing}
                  className="rounded-full border border-hearth-700/70 px-3 py-1 text-sm text-hearth-100"
                >
                  {thing}
                </li>
              ))}
            </ul>
          ) : null}

          {facts.length > 0 ? (
            <ul className="space-y-1">
              {facts.slice(0, 4).map((fact) => (
                <li key={fact.id} className="text-sm text-hearth-300">
                  {fact.content}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="button"
              onClick={() => setStep("shut")}
              className="text-sm text-hearth-200 underline underline-offset-4"
            >
              Got it
            </button>
            <button
              type="button"
              onClick={askForNudges}
              disabled={thinking}
              className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-50"
            >
              {thinking ? "Thinking…" : "Still stuck — give me a nudge"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-hearth-400">
            Three things somebody noticed. What you do about them is up to you.
          </p>
          <ul className="space-y-2">
            {(nudges ?? []).map((nudge, position) => (
              <li key={position} className="text-hearth-200">
                {nudge}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setNudges(null);
              setStep("shut");
            }}
            className="text-sm text-hearth-200 underline underline-offset-4"
          >
            Got it
          </button>
        </>
      )}

      {noIdeas ? <p className="text-sm text-hearth-500">{noIdeas}</p> : null}
    </div>
  );
}
