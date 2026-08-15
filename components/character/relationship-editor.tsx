"use client";

import { useActionState } from "react";
import {
  confirmRelationshipAction,
  removeRelationshipAction,
  setRelationshipAction,
} from "@/lib/game/actions";
import type { FormState } from "@/lib/auth/actions";
import { RELATIONSHIP_KINDS, RELATIONSHIP_LABELS, bondProgress, type RelationshipKind } from "@/lib/game/rules";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type RelationRow = {
  id: string;
  otherId: string;
  otherName: string;
  kind: RelationshipKind;
  bondXp: number;
  /**
   * Who still has to agree, or null when nobody does.
   *
   * "you" means this household is being asked and there is a button to press.
   * "them" means we asked and are waiting. A tie between two adventurers that
   * both answer to one account is never either — see `lib/game/ties.ts`.
   */
  waitingOn: "you" | "them" | null;
};

export function RelationshipEditor({
  characterId,
  characterName,
  relations,
  others,
}: {
  characterId: string;
  characterName: string;
  relations: RelationRow[];
  /** `playedBy` is set only for adventurers somebody else answers for. */
  others: { id: string; name: string; playedBy?: string | null }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(setRelationshipAction, null);

  const unrelated = others.filter((other) => !relations.some((relation) => relation.otherId === other.id));

  return (
    <div className="space-y-5">
      {relations.length > 0 ? (
        <ul className="divide-y divide-hearth-800/50">
          {relations.map((relation) => {
            const bond = bondProgress(relation.bondXp);
            return (
              /* The sentence gets the whole width on a phone, and the buttons
                 drop beneath it. Two buttons and a wrapping explanation on a
                 390-pixel screen left the text a column four characters wide —
                 "Mira is / the child / of Rowan" — which is the same failure
                 the stat rows had, and the same fix. */
              <li key={relation.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 basis-full text-hearth-200 sm:basis-0">
                  {characterName} is the{" "}
                  <span className="text-hearth-100">{RELATIONSHIP_LABELS[relation.kind]}</span>{" "}
                  {relation.otherName}
                  {/* Said plainly rather than shown as a badge. A bond that is
                      not earning anything yet is the sort of thing a family
                      needs told, not hinted. */}
                  {relation.waitingOn === "them" ? (
                    <span className="mt-0.5 block text-sm text-amber-300/80">
                      Waiting for whoever plays {relation.otherName} to agree. Until then this
                      earns nothing.
                    </span>
                  ) : relation.waitingOn === "you" ? (
                    <span className="mt-0.5 block text-sm text-amber-300/80">
                      Somebody says this is true. Nothing is earned until you agree.
                    </span>
                  ) : null}
                </span>

                {relation.waitingOn === null ? (
                  <span
                    className="text-sm text-hearth-400"
                    title={
                      bond.needed === null
                        ? "This bond is as strong as it gets."
                        : `${bond.into} of ${bond.needed} toward the next level`
                    }
                  >
                    Bond {bond.level}
                  </span>
                ) : null}

                {relation.waitingOn === "you" ? (
                  <form action={confirmRelationshipAction} className="ml-auto">
                    <input type="hidden" name="relationshipId" value={relation.id} />
                    <SubmitButton variant="secondary" pendingLabel="Agreeing…">
                      Yes, that&rsquo;s right
                    </SubmitButton>
                  </form>
                ) : null}

                <form action={removeRelationshipAction}>
                  <input type="hidden" name="relationshipId" value={relation.id} />
                  <SubmitButton variant="danger" pendingLabel="Removing…">
                    {relation.waitingOn === "you" ? "No" : "Remove"}
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-hearth-400">
          No family ties yet — and nothing is being earned. Bonds only grow between adventurers
          who have said how they are related, so until somebody here is named a sister, a father
          or a best friend, every kind thing they do for each other counts for nothing.
        </p>
      )}

      {others.length === 0 ? (
        <p className="text-sm text-hearth-400">
          Nobody to be related to yet. Make another adventurer, or start an adventure together —
          anybody at your table can be named here.
        </p>
      ) : unrelated.length === 0 ? (
        <p className="text-sm text-hearth-400">{characterName} is related to everyone else already.</p>
      ) : (
        <form action={formAction} className="space-y-3 border-t border-hearth-800/50 pt-5">
          {state?.error ? <Alert>{state.error}</Alert> : null}

          <input type="hidden" name="fromId" value={characterId} />

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-40 flex-1">
              <span className="mb-1.5 block text-sm font-medium text-hearth-200">
                {characterName} is the…
              </span>
              <select
                name="kind"
                defaultValue="SIBLING"
                className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              >
                {RELATIONSHIP_KINDS.map((kind) => (
                  <option key={kind} value={kind} className="bg-hearth-950">
                    {RELATIONSHIP_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-40 flex-1">
              <span className="mb-1.5 block text-sm font-medium text-hearth-200">…</span>
              <select
                name="toId"
                className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              >
                {unrelated.map((other) => (
                  <option key={other.id} value={other.id} className="bg-hearth-950">
                    {other.playedBy ? `${other.name} (${other.playedBy})` : other.name}
                  </option>
                ))}
              </select>
            </label>

            <SubmitButton variant="secondary" pendingLabel="Adding…">Add tie</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
