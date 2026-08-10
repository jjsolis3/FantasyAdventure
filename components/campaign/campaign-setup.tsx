"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createCampaignAction } from "@/lib/game/campaign-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { INPUT_MODE_OPTIONS, READING_LEVEL_OPTIONS, TONE_OPTIONS } from "./options";
import { PACING_OPTIONS } from "@/lib/game/pacing";
import type { InviteCandidate } from "@/lib/game/invites";

export type StorylineChoice = {
  id: string;
  title: string;
  tagline: string;
  premise: string;
  hook: string;
  defaultTone: string;
  readingLevel: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedScenes: number;
  actCount: number;
};

export type CharacterChoice = {
  id: string;
  name: string;
  race: string;
  archetype: string;
  ageBand: string;
};

export function CampaignSetup({
  storylines,
  characters,
  invitable,
  defaultReadingLevel,
}: {
  storylines: StorylineChoice[];
  characters: CharacterChoice[];
  invitable: InviteCandidate[];
  defaultReadingLevel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createCampaignAction, null);

  const [storylineId, setStorylineId] = useState("");
  const [title, setTitle] = useState("");
  // Null until a storyline is chosen, at which point its defaults are adopted —
  // but an explicit choice afterwards must not be overwritten.
  const [tone, setTone] = useState<string | null>(null);
  const [readingLevel, setReadingLevel] = useState<string | null>(null);
  const [pacing, setPacing] = useState("STANDARD");
  const [inputMode, setInputMode] = useState("SHARED_SCREEN");
  const [partyIds, setPartyIds] = useState<string[]>([]);
  const [inviteIds, setInviteIds] = useState<string[]>([]);

  const chosen = storylines.find((storyline) => storyline.id === storylineId);

  function pickStoryline(storyline: StorylineChoice) {
    setStorylineId(storyline.id);
    // Only prefill the title if the player has not written their own.
    setTitle((current) =>
      current === "" || storylines.some((entry) => entry.title === current) ? storyline.title : current,
    );
    setTone(storyline.defaultTone);
    setReadingLevel(storyline.readingLevel);
  }

  function togglePartyMember(id: string) {
    setPartyIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function toggleInvite(id: string) {
    setInviteIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  // Everyone who has been asked counts toward the party size. They are not in
  // it yet — the adventure waits for them — but the storyline's minimum is a
  // question about who is coming, not about who has replied.
  const partySize = partyIds.length + inviteIds.length;
  const partySizeOk =
    chosen !== undefined &&
    partyIds.length >= 1 &&
    partySize >= chosen.minPlayers &&
    partySize <= chosen.maxPlayers;

  return (
    <form action={formAction} className="space-y-10">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      <input type="hidden" name="storylineId" value={storylineId} />
      <input type="hidden" name="tone" value={tone ?? "COZY"} />
      <input type="hidden" name="readingLevel" value={readingLevel ?? defaultReadingLevel} />
      <input type="hidden" name="pacing" value={pacing} />
      <input type="hidden" name="inputMode" value={inputMode} />

      {/* ---- 1. The adventure ------------------------------------------- */}
      <section>
        <h2 className="font-display mb-1 text-xl text-hearth-100">1 · Choose an adventure</h2>
        <p className="mb-4 text-sm text-hearth-400">
          The storyteller improvises freely inside whichever you pick — you can wander off the path
          and it will follow you.
        </p>

        <div className="space-y-3">
          {storylines.map((storyline) => {
            const selected = storyline.id === storylineId;
            return (
              <button
                key={storyline.id}
                type="button"
                onClick={() => pickStoryline(storyline)}
                className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-hearth-500 bg-hearth-800/40"
                    : "border-hearth-800/60 bg-hearth-900/30 hover:border-hearth-700"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-lg text-hearth-100">{storyline.title}</span>
                  <span className="text-xs text-hearth-400">
                    {storyline.minPlayers}–{storyline.maxPlayers} adventurers · {storyline.actCount} acts
                  </span>
                </div>
                <p className="mt-1 text-sm text-hearth-200/70 italic">{storyline.tagline}</p>
                {selected ? (
                  <p className="mt-3 text-sm leading-relaxed text-hearth-200/60">{storyline.premise}</p>
                ) : null}
              </button>
            );
          })}
        </div>
        {state?.fieldErrors?.storylineId ? (
          <p className="mt-2 text-sm text-red-300">{state.fieldErrors.storylineId}</p>
        ) : null}
      </section>

      {/* ---- 2. The party ------------------------------------------------ */}
      <section className="border-t border-hearth-800/50 pt-8">
        <h2 className="font-display mb-1 text-xl text-hearth-100">2 · Who is going?</h2>
        <p className="mb-4 text-sm text-hearth-400">
          {chosen
            ? `${chosen.title} takes ${chosen.minPlayers}–${chosen.maxPlayers} adventurers.`
            : "Choose an adventure first to see how many can come."}
        </p>

        {characters.length === 0 ? (
          <Alert tone="info">
            No adventurers yet.{" "}
            <Link href="/characters/new" className="underline hover:text-hearth-100">
              Build one first
            </Link>
            .
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              {characters.map((character) => {
                const selected = partyIds.includes(character.id);
                const order = partyIds.indexOf(character.id);
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => togglePartyMember(character.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-hearth-500 bg-hearth-800/40"
                        : "border-hearth-800/60 bg-hearth-900/30 hover:border-hearth-700"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                        selected
                          ? "border-hearth-400 bg-hearth-600 text-hearth-50"
                          : "border-hearth-700 text-hearth-500"
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

            <p className="mt-3 text-sm text-hearth-400" aria-live="polite">
              {partyIds.length} chosen
              {partyIds.length > 1 ? ". The numbers are the order they are asked each turn." : ""}
            </p>
          </>
        )}

        {partyIds.map((id) => (
          <input key={id} type="hidden" name="partyIds" value={id} />
        ))}

        {invitable.length > 0 ? (
          <div className="mt-8 border-t border-hearth-800/40 pt-6">
            <h3 className="mb-1 text-sm font-medium tracking-wide text-hearth-300 uppercase">
              Ask somebody else along
            </h3>
            <p className="mb-4 text-sm text-hearth-400">
              Adventurers played by other people. They will be asked, and the adventure waits until
              they say yes — so nobody has to hand over their character to come along.
            </p>

            <div className="space-y-2">
              {invitable.map((candidate) => {
                const selected = inviteIds.includes(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => toggleInvite(candidate.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-moss-600 bg-moss-900/20"
                        : "border-hearth-800/60 bg-hearth-900/30 hover:border-hearth-700"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                        selected
                          ? "border-moss-500 bg-moss-700 text-hearth-50"
                          : "border-hearth-700 text-hearth-500"
                      }`}
                      aria-hidden
                    >
                      {selected ? "✓" : "+"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-hearth-100">{candidate.name}</span>
                      <span className="block text-sm text-hearth-400">
                        {candidate.race} {candidate.archetype} · played by {candidate.playedBy}
                      </span>
                      {candidate.tie ? (
                        <span className="mt-0.5 block text-sm text-moss-400">{candidate.tie}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-sm text-hearth-400" aria-live="polite">
              {inviteIds.length === 0
                ? "Nobody invited yet."
                : `${inviteIds.length} to invite — they will be asked once this adventure exists.`}
            </p>
          </div>
        ) : null}

        {inviteIds.map((id) => (
          <input key={id} type="hidden" name="inviteIds" value={id} />
        ))}

        {chosen && !partySizeOk ? (
          <p className="mt-4 text-sm text-hearth-300" aria-live="polite">
            {partyIds.length === 0
              ? "Pick at least one of your own adventurers to lead the way."
              : partySize < chosen.minPlayers
                ? `${chosen.title} needs ${chosen.minPlayers} — that is ${partySize} so far, counting anyone invited.`
                : `That is ${partySize}, and ${chosen.title} takes at most ${chosen.maxPlayers}.`}
          </p>
        ) : null}
      </section>

      {/* ---- 3. Where everyone is sitting -------------------------------- */}
      <section className="border-t border-hearth-800/50 pt-8">
        <h2 className="font-display mb-1 text-xl text-hearth-100">3 · Where is everyone?</h2>
        <p className="mb-4 text-sm text-hearth-400">
          The story is the same either way — one adventure, one turn at a time. This only decides
          where the answers are typed, and you can change it whenever the evening changes.
        </p>

        <div className="space-y-2">
          {INPUT_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setInputMode(option.value)}
              className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                inputMode === option.value
                  ? "border-hearth-500 bg-hearth-800/40"
                  : "border-hearth-800/60 hover:border-hearth-700"
              }`}
            >
              <span className="block text-hearth-100">{option.label}</span>
              <span className="block text-sm text-hearth-400">{option.blurb}</span>
            </button>
          ))}
        </div>

        {inputMode === "OWN_DEVICE" ? (
          <p className="mt-3 text-sm text-hearth-400">
            Everyone who plays from their own device needs their own sign-in. Once this adventure
            exists it will show a code they can use to bring an adventurer along.
          </p>
        ) : null}
      </section>

      {/* ---- 4. How it is told ------------------------------------------- */}
      <section className="border-t border-hearth-800/50 pt-8">
        <h2 className="font-display mb-1 text-xl text-hearth-100">4 · How should it be told?</h2>
        <p className="mb-4 text-sm text-hearth-400">
          These are fixed to this adventure once it begins, so changing your profile later will not
          rewrite a story in progress.
        </p>

        <div className="space-y-5">
          <Field
            label="Name this adventure"
            name="title"
            value={title}
            onChange={setTitle}
            error={state?.fieldErrors?.title}
            hint="Whatever your family will call it."
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-hearth-200">Tone</legend>
            <div className="space-y-2">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTone(option.value)}
                  className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                    (tone ?? "COZY") === option.value
                      ? "border-hearth-500 bg-hearth-800/40"
                      : "border-hearth-800/60 hover:border-hearth-700"
                  }`}
                >
                  <span className="block text-hearth-100">{option.label}</span>
                  <span className="block text-sm text-hearth-400">{option.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-hearth-200">Reading level</legend>
            <div className="space-y-2">
              {READING_LEVEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReadingLevel(option.value)}
                  className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                    (readingLevel ?? defaultReadingLevel) === option.value
                      ? "border-hearth-500 bg-hearth-800/40"
                      : "border-hearth-800/60 hover:border-hearth-700"
                  }`}
                >
                  <span className="block text-hearth-100">{option.label}</span>
                  <span className="block text-sm text-hearth-400">{option.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-hearth-200">
              How long should it run?
            </legend>
            <div className="space-y-2">
              {PACING_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPacing(option.key)}
                  className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                    pacing === option.key
                      ? "border-hearth-500 bg-hearth-800/40"
                      : "border-hearth-800/60 hover:border-hearth-700"
                  }`}
                >
                  <span className="block text-hearth-100">{option.label}</span>
                  <span className="block text-sm text-hearth-400">{option.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <SubmitButton pendingLabel="Preparing…">Begin the preparations</SubmitButton>
    </form>
  );
}
