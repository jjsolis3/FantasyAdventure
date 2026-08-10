"use client";

import { useActionState, useState } from "react";
import { cancelHandoverAction, offerCharacterAction } from "@/lib/game/handover-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Handing an adventurer to the player who is actually playing them.
 *
 * The whole point of this card is the sentence about what comes along, so it is
 * said before the button rather than after: the fear it answers — that a child
 * getting their own sign-in means starting again at level 1 — is the reason
 * somebody would otherwise never press it.
 */
export function Handover({
  characterId,
  characterName,
  code,
}: {
  characterId: string;
  characterName: string;
  code: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(offerCharacterAction, null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused over plain http in some browsers. The code is on the screen.
    }
  }

  return (
    <div className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <p className="text-sm text-hearth-400">
        If {characterName} is being played by somebody with their own sign-in, hand them over rather
        than having them build a new adventurer. Everything comes along: their experience and level,
        their skill ranks, what they are carrying, their family ties and the bonds in them, and their
        place in every adventure they are travelling in.
      </p>

      {code === null ? (
        <form action={formAction}>
          <input type="hidden" name="characterId" value={characterId} />
          <SubmitButton variant="secondary" pendingLabel="Making a code…">
            Hand {characterName} to another player
          </SubmitButton>
        </form>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-display text-2xl tracking-[0.15em] text-hearth-100 select-all">{code}</p>
            <p className="mt-2 text-sm text-hearth-400">
              They sign in, go to <span className="text-hearth-300">Adventurers → Take one on</span>,
              and type this. {characterName} leaves your list the moment they do.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50"
            >
              {copied ? "Copied" : "Copy the code"}
            </button>

            <form action={cancelHandoverAction}>
              <input type="hidden" name="characterId" value={characterId} />
              <SubmitButton variant="secondary" pendingLabel="Cancelling…">
                Never mind
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
