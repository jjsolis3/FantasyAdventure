"use client";

import { useActionState, useState } from "react";
import { joinCampaignAction } from "@/lib/game/party-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type JoinableCharacter = {
  id: string;
  name: string;
  race: string;
  archetype: string;
};

export function JoinForm({
  characters,
  initialCode,
}: {
  characters: JoinableCharacter[];
  initialCode: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(joinCampaignAction, null);
  const [code, setCode] = useState(initialCode);
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="The code"
        name="code"
        value={code}
        onChange={setCode}
        placeholder="PARTY-K3M9-PQ7T"
        error={state?.fieldErrors?.code}
        hint="Case and spacing do not matter."
      />

      <input type="hidden" name="characterId" value={characterId} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-hearth-200">Who is coming?</legend>
        <div className="space-y-2">
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => setCharacterId(character.id)}
              className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                characterId === character.id
                  ? "border-hearth-500 bg-hearth-800/40"
                  : "border-hearth-800/60 bg-hearth-900/30 hover:border-hearth-700"
              }`}
            >
              <span className="block text-hearth-100">{character.name}</span>
              <span className="block text-sm text-hearth-400">
                {character.race} {character.archetype}
              </span>
            </button>
          ))}
        </div>
        {state?.fieldErrors?.characterId ? (
          <p className="mt-2 text-sm text-red-300">{state.fieldErrors.characterId}</p>
        ) : null}
      </fieldset>

      <SubmitButton pendingLabel="Joining…">Join the adventure</SubmitButton>
    </form>
  );
}
