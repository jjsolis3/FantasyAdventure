"use client";

import { useActionState } from "react";
import { removeRelationshipAction, setRelationshipAction } from "@/lib/game/actions";
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
  others: { id: string; name: string }[];
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
              <li key={relation.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 text-hearth-200">
                  {characterName} is the{" "}
                  <span className="text-hearth-100">{RELATIONSHIP_LABELS[relation.kind]}</span>{" "}
                  {relation.otherName}
                </span>

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

                <form action={removeRelationshipAction}>
                  <input type="hidden" name="relationshipId" value={relation.id} />
                  <SubmitButton variant="danger" pendingLabel="Removing…">Remove</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-hearth-400">
          No family ties yet. Bonds grow when characters help each other, and unlock moves they can
          only use together.
        </p>
      )}

      {others.length === 0 ? (
        <p className="text-sm text-hearth-400">
          Add another adventurer first, then you can say how they are related.
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
                    {other.name}
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
