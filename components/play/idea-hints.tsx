"use client";

import { useState } from "react";

/**
 * "I don't know what to do" — three suggestions from the storyteller.
 *
 * Shared by the shared-screen prompt and the own-device round board, because a
 * child stuck for an idea is stuck in exactly the same way on either.
 */
export function IdeaHints({
  campaignId,
  characterId,
  onPick,
}: {
  campaignId: string;
  characterId: string;
  onPick: (idea: string) => void;
}) {
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [noIdeas, setNoIdeas] = useState("");

  async function askForIdeas() {
    setThinking(true);
    setNoIdeas("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = (await response.json()) as { suggestions?: string[]; error?: string };
      if (!response.ok || !data.suggestions?.length) {
        setNoIdeas(data.error ?? "No ideas just now — but anything you type will work.");
        return;
      }
      setIdeas(data.suggestions);
    } catch {
      setNoIdeas("No ideas just now — but anything you type will work.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="space-y-2">
      {ideas === null ? (
        <button
          type="button"
          onClick={askForIdeas}
          disabled={thinking}
          className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-50"
        >
          {thinking ? "Thinking of some ideas…" : "I don't know what to do"}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-hearth-400">
            Some ideas — pick one to start from, or ignore them all.
          </p>
          <div className="flex flex-col gap-2">
            {ideas.map((idea, position) => (
              <button
                key={position}
                type="button"
                onClick={() => {
                  onPick(idea);
                  setIdeas(null);
                }}
                className="rounded-lg border border-hearth-800/70 px-3 py-2 text-left text-hearth-200 transition-colors hover:border-hearth-600 hover:bg-hearth-800/30"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
      )}
      {noIdeas ? <p className="text-sm text-hearth-500">{noIdeas}</p> : null}
    </div>
  );
}
