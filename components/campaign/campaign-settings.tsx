"use client";

import { useActionState, useState } from "react";
import { updateCampaignSettingsAction, updatePartyAction } from "@/lib/game/campaign-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert, Field, SelectField } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { READING_LEVEL_OPTIONS, TONE_OPTIONS } from "./options";
import type { CharacterChoice } from "./campaign-setup";

export function CampaignSettingsForm({
  campaignId,
  title,
  tone,
  readingLevel,
}: {
  campaignId: string;
  title: string;
  tone: string;
  readingLevel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateCampaignSettingsAction, null);
  const saved = state !== null && state.error === "";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Saved.</Alert> : null}

      <input type="hidden" name="campaignId" value={campaignId} />

      <Field label="Name" name="title" defaultValue={title} error={state?.fieldErrors?.title} />
      <SelectField
        label="Tone"
        name="tone"
        defaultValue={tone}
        options={TONE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />
      <SelectField
        label="Reading level"
        name="readingLevel"
        defaultValue={readingLevel}
        options={READING_LEVEL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />

      <SubmitButton variant="secondary" pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

export function PartyEditor({
  campaignId,
  characters,
  initialPartyIds,
  minPlayers,
  maxPlayers,
}: {
  campaignId: string;
  characters: CharacterChoice[];
  initialPartyIds: string[];
  minPlayers: number;
  maxPlayers: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updatePartyAction, null);
  const [partyIds, setPartyIds] = useState<string[]>(initialPartyIds);
  const saved = state !== null && state.error === "";

  function toggle(id: string) {
    setPartyIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Party updated.</Alert> : null}

      <input type="hidden" name="campaignId" value={campaignId} />

      <div className="space-y-2">
        {characters.map((character) => {
          const selected = partyIds.includes(character.id);
          const order = partyIds.indexOf(character.id);
          return (
            <button
              key={character.id}
              type="button"
              onClick={() => toggle(character.id)}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? "border-hearth-500 bg-hearth-800/40"
                  : "border-hearth-800/60 bg-hearth-900/30 hover:border-hearth-700"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                  selected ? "border-hearth-400 bg-hearth-600 text-hearth-50" : "border-hearth-700 text-hearth-500"
                }`}
                aria-hidden
              >
                {selected ? order + 1 : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-hearth-100">{character.name}</span>
                <span className="block text-sm text-hearth-400">
                  {character.race} {character.archetype}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-hearth-400" aria-live="polite">
        {partyIds.length} chosen · this adventure takes {minPlayers}–{maxPlayers}
      </p>

      {partyIds.map((id) => (
        <input key={id} type="hidden" name="partyIds" value={id} />
      ))}

      <SubmitButton variant="secondary" pendingLabel="Saving…">Save party</SubmitButton>
    </form>
  );
}
