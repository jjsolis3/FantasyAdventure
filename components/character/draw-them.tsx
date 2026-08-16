"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";

/**
 * "Draw them" — asking the drawing service for a portrait.
 *
 * A button rather than something automatic, and the button is the design. A
 * picture costs real money and takes most of a minute; drawing every adventurer
 * the moment somebody tries on a cloak would be a bill nobody agreed to, for
 * pictures nobody had asked to see. Nothing in the game is waiting on this.
 *
 * Shown even when no drawing service is configured, with the reason under it,
 * because "why can I not do that" is a worse question than "oh, we would need
 * to set one up".
 */
export function DrawThem({
  characterId,
  enabled,
  /** True when a portrait exists but was drawn from a different outfit. */
  stale,
  hasArt,
}: {
  characterId: string;
  enabled: boolean;
  stale: boolean;
  hasArt: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function draw() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/characters/${characterId}/art`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That did not work. Try again in a moment?");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not work. Try again in a moment?");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <p className="text-sm text-hearth-400">
        The game could draw them too, but no drawing service is set up on this copy. An
        administrator can add one at Settings → Storyteller.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {stale ? (
        <Alert tone="info">
          They have changed since this was drawn. Draw them again to catch up.
        </Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      <button
        type="button"
        onClick={draw}
        disabled={busy}
        className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-40"
      >
        {busy ? "Drawing… this takes a moment" : hasArt ? "Draw them again" : "Draw them"}
      </button>
      <p className="text-sm text-hearth-500">
        Uses whatever they are wearing above. It takes about a minute, and it costs whatever your
        drawing service charges.
      </p>
    </div>
  );
}
