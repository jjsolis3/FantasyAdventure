"use client";

import { useActionState } from "react";
import { setRelationshipAction } from "@/lib/game/actions";
import type { FormState } from "@/lib/auth/actions";
import { RELATIONSHIP_KINDS, RELATIONSHIP_LABELS } from "@/lib/game/rules";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type UntiedPair = {
  /** Always an adventurer this household answers for — one end must be yours. */
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** Set when the other end belongs to somebody else, so the wait is expected. */
  toPlayedBy: string | null;
};

/**
 * Saying who is who, at the moment it is obvious.
 *
 * The character sheet has always had the tie editor, and nobody found it: you
 * go there to look at an adventurer, not to think about the party. The moment
 * you are actually thinking about who is travelling with whom is right here,
 * choosing the party — and it is also the last moment before it starts costing
 * something, because bonds only grow between adventurers who have said how they
 * are related.
 *
 * Only pairs with nothing declared appear, so this empties itself as it is used
 * and vanishes once the party is sorted out.
 */
export function PartyTies({
  pairs,
  elsewhere = [],
}: {
  pairs: UntiedPair[];
  /**
   * Pairs where neither adventurer is yours.
   *
   * Not a gap in the rules but a consequence of them: one end of a tie must
   * always be somebody you answer for, so two children on two sign-ins can only
   * be declared sisters by one of them. Silence here would cost them the whole
   * bond, so the pair is named and whoever is running the evening can say it
   * out loud — which, at a kitchen table, is faster than any button.
   */
  elsewhere?: { names: string[]; households: string[] }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(setRelationshipAction, null);

  if (pairs.length === 0 && elsewhere.length === 0) return null;

  return (
    <div className="mt-6 border-t border-hearth-800/50 pt-5">
      <h3 className="mb-1 text-sm font-medium tracking-wide text-hearth-400 uppercase">
        Who is who
      </h3>
      {/* The reason, not the instruction. A family that knows an undeclared
          pair earns nothing will sort it out in ten seconds; one that thinks
          this is optional decoration will skip it and wonder later why the
          bonds never moved. */}
      <p className="mb-3 text-sm text-hearth-400">
        {pairs.length > 0 ? "These two have not been introduced. " : ""}
        Bonds only grow between adventurers who have said how they are related, so this is worth a
        moment now — it is what unlocks the moves they can only use together.
      </p>

      {state?.error ? <Alert>{state.error}</Alert> : null}

      <ul className="space-y-2">
        {pairs.map((pair) => (
          <li key={`${pair.fromId}:${pair.toId}`}>
            <form action={formAction} className="flex flex-wrap items-center gap-2 text-hearth-200">
              <input type="hidden" name="fromId" value={pair.fromId} />
              <input type="hidden" name="toId" value={pair.toId} />

              <span>{pair.fromName} is the</span>

              <select
                name="kind"
                defaultValue="SIBLING"
                aria-label={`How ${pair.fromName} is related to ${pair.toName}`}
                className="rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-2 py-1 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              >
                {RELATIONSHIP_KINDS.map((kind) => (
                  <option key={kind} value={kind} className="bg-hearth-950">
                    {RELATIONSHIP_LABELS[kind]}
                  </option>
                ))}
              </select>

              <span>{pair.toName}</span>

              <SubmitButton variant="secondary" pendingLabel="Saying…">
                Say so
              </SubmitButton>

              {/* Warned before they press it rather than after. Somebody else's
                  adventurer is somebody else's to agree to. */}
              {pair.toPlayedBy ? (
                <span className="text-sm text-hearth-500">
                  {pair.toPlayedBy} will be asked to agree
                </span>
              ) : null}
            </form>
          </li>
        ))}
      </ul>

      {elsewhere.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {elsewhere.map((pair) => (
            <li key={pair.names.join(":")} className="text-sm text-hearth-400">
              {pair.names[0]} and {pair.names[1]} have not been introduced either —{" "}
              {pair.households[0] === pair.households[1]
                ? pair.households[0]
                : `${pair.households[0]} or ${pair.households[1]}`}{" "}
              can say so from their own sheet.
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
