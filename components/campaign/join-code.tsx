"use client";

import { useState } from "react";
import { regenerateJoinCodeAction } from "@/lib/game/party-actions";
import { SubmitButton } from "@/components/submit-button";

/**
 * The code another household types to bring an adventurer along.
 *
 * Shown as text first and a button second: the most likely way this gets used
 * is somebody reading it out across the room, and the copy button is for the
 * times when the other player is not in the room at all.
 */
export function JoinCode({
  campaignId,
  code,
  isOwner,
}: {
  campaignId: string;
  code: string;
  isOwner: boolean;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copy(what: "code" | "link") {
    const text =
      what === "code" ? code : `${window.location.origin}/campaigns/join?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access is refused in some browsers over plain http. The code
      // is on the screen either way, which is the part that matters.
    }
  }

  return (
    <div className="space-y-4">
      <p className="font-display text-2xl tracking-[0.15em] text-hearth-100 select-all">{code}</p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => copy("code")}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50"
        >
          {copied === "code" ? "Copied" : "Copy the code"}
        </button>
        <button
          type="button"
          onClick={() => copy("link")}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50"
        >
          {copied === "link" ? "Copied" : "Copy a link"}
        </button>

        {isOwner ? (
          <form action={regenerateJoinCodeAction}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <SubmitButton variant="secondary" pendingLabel="Changing…">
              Change the code
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
