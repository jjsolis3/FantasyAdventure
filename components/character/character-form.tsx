"use client";

import { useActionState, useMemo, useState } from "react";
import { createCharacterAction, updateCharacterAction } from "@/lib/game/actions";
import type { FormState } from "@/lib/auth/actions";
import { AGE_BANDS, ARCHETYPES, PRONOUN_PRESETS, RACES, findArchetype, findRace } from "@/lib/game/character-options";
import { SKILLS_PER_CHARACTER, type StatBlock, type StatKey } from "@/lib/game/rules";
import { generateName } from "@/lib/game/names";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { StatAllocator } from "./stat-allocator";

const OTHER = "__other__";

export type CharacterDraft = {
  id?: string;
  name: string;
  race: string;
  archetype: string;
  gender: string;
  pronouns: string;
  ageBand: string;
  description: string;
  stats: StatBlock;
  skills: string[];
};

export const BLANK_CHARACTER: CharacterDraft = {
  name: "",
  race: "",
  archetype: "",
  gender: "",
  pronouns: "they/them",
  ageBand: "GROWNUP",
  description: "",
  stats: { might: 3, wits: 3, heart: 3, spark: 3 },
  skills: [],
};

/**
 * A picker that offers suggestions without becoming a cage — anything not in
 * the list can still be typed, because "Cloud Baker" should be a legal calling.
 */
function ChoiceField({
  label,
  name,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  name: string;
  options: { value: string; blurb: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const isPreset = options.some((option) => option.value === value);
  const [showCustom, setShowCustom] = useState(value !== "" && !isPreset);

  const selected = options.find((option) => option.value === value);

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-hearth-200">{label}</span>
        {/* The select carries no `name`: the hidden input below is what the
            server reads, so free-typed values submit the same way presets do. */}
        <select
          id={`choice-${name}`}
          aria-label={label}
          value={showCustom ? OTHER : value}
          onChange={(event) => {
            if (event.target.value === OTHER) {
              setShowCustom(true);
              onChange("");
            } else {
              setShowCustom(false);
              onChange(event.target.value);
            }
          }}
          className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
        >
          <option value="" className="bg-hearth-950">
            Choose…
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-hearth-950">
              {option.value}
            </option>
          ))}
          <option value={OTHER} className="bg-hearth-950">
            Something else…
          </option>
        </select>
      </label>

      {showCustom ? (
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your own"
          className="mt-2 w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/50 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
        />
      ) : null}

      {selected ? <p className="mt-1.5 text-sm text-hearth-400 italic">{selected.blurb}</p> : null}
      {error ? <p className="mt-1.5 text-sm text-red-300">{error}</p> : null}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function CharacterForm({ initial, mode }: { initial: CharacterDraft; mode: "create" | "edit" }) {
  const action = mode === "create" ? createCharacterAction : updateCharacterAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const saved = mode === "edit" && state !== null && state.error === "";

  const [name, setName] = useState(initial.name);
  const [race, setRace] = useState(initial.race);
  const [archetype, setArchetype] = useState(initial.archetype);
  const [pronouns, setPronouns] = useState(initial.pronouns);
  const [stats, setStats] = useState<StatBlock>(initial.stats);
  const [skills, setSkills] = useState<string[]>(initial.skills);

  // The calling's affinity wins over the race's, since it is the more
  // deliberate choice.
  const affinity: StatKey | null =
    findArchetype(archetype)?.affinity ?? findRace(race)?.affinity ?? null;

  const suggested = useMemo(() => findArchetype(archetype)?.skills ?? [], [archetype]);
  const skillPool = useMemo(() => {
    const rest = ARCHETYPES.flatMap((entry) => entry.skills).filter((skill) => !suggested.includes(skill));
    return [...suggested, ...[...new Set(rest)].sort()];
  }, [suggested]);

  const atSkillLimit = skills.length >= SKILLS_PER_CHARACTER;

  function toggleSkill(skill: string) {
    setSkills((current) =>
      current.includes(skill)
        ? current.filter((entry) => entry !== skill)
        : current.length < SKILLS_PER_CHARACTER
          ? [...current, skill]
          : current,
    );
  }

  return (
    <form action={formAction} className="space-y-8">
      {initial.id ? <input type="hidden" name="characterId" value={initial.id} /> : null}

      {state?.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="space-y-5">
        <div>
          <Field
            label="Name"
            name="name"
            value={name}
            onChange={setName}
            error={state?.fieldErrors?.name}
            placeholder="Mira Thistledown"
          />
          <button
            type="button"
            onClick={() => setName(generateName({ race, archetype }))}
            className="mt-2 rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-200 transition-colors hover:border-hearth-600 hover:bg-hearth-800/50"
          >
            🎲 Surprise me
          </button>
          <span className="ml-3 text-sm text-hearth-400">
            {race || archetype
              ? "Suggestions follow your race and calling."
              : "Pick a race and calling first for names that suit them."}
          </span>
        </div>

        <ChoiceField label="Race" name="race" options={RACES} value={race} onChange={setRace} error={state?.fieldErrors?.race} />
        <ChoiceField
          label="Calling"
          name="archetype"
          options={ARCHETYPES}
          value={archetype}
          onChange={setArchetype}
          error={state?.fieldErrors?.archetype}
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">Age</span>
          <select
            name="ageBand"
            defaultValue={initial.ageBand}
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          >
            {AGE_BANDS.map((band) => (
              <option key={band.value} value={band.value} className="bg-hearth-950">
                {band.label} — {band.blurb}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Gender"
            name="gender"
            required={false}
            defaultValue={initial.gender}
            placeholder="However you like"
            error={state?.fieldErrors?.gender}
          />

          <div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-hearth-200">Pronouns</span>
              <input
                name="pronouns"
                value={pronouns}
                onChange={(event) => setPronouns(event.target.value)}
                className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRONOUN_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPronouns(preset)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    pronouns === preset
                      ? "border-hearth-500 bg-hearth-700/50 text-hearth-100"
                      : "border-hearth-700/60 text-hearth-300 hover:border-hearth-600"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            {state?.fieldErrors?.pronouns ? (
              <p className="mt-1.5 text-sm text-red-300">{state.fieldErrors.pronouns}</p>
            ) : null}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">
            What do they look like? How do they act?
          </span>
          <textarea
            name="description"
            rows={4}
            defaultValue={initial.description}
            placeholder="Freckles, a too-big coat, and a habit of naming every animal she meets."
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/50 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          />
          <span className="mt-1.5 block text-sm text-hearth-400">
            The storyteller reads this, so anything you write here will show up in the adventure.
          </span>
        </label>
      </div>

      <div className="border-t border-hearth-800/50 pt-6">
        <StatAllocator stats={stats} onChange={setStats} affinity={affinity} />
      </div>

      <div className="border-t border-hearth-800/50 pt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-medium text-hearth-200">
            Pick {SKILLS_PER_CHARACTER} things you are especially good at
          </span>
          <span className="text-sm text-hearth-400">
            {skills.length}/{SKILLS_PER_CHARACTER}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {skillPool.map((skill) => {
            const chosen = skills.includes(skill);
            const isSuggested = suggested.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                disabled={!chosen && atSkillLimit}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-30 ${
                  chosen
                    ? "border-hearth-500 bg-hearth-700/50 text-hearth-100"
                    : isSuggested
                      ? "border-moss-600/50 text-moss-400 hover:border-moss-600"
                      : "border-hearth-800/70 text-hearth-300 hover:border-hearth-700"
                }`}
              >
                {skill}
              </button>
            );
          })}
        </div>
        {suggested.length > 0 ? (
          <p className="mt-3 text-sm text-hearth-400">
            Green ones suit a {archetype}, but you are free to pick any of them.
          </p>
        ) : null}

        {skills.map((skill) => (
          <input key={skill} type="hidden" name="skills" value={skill} />
        ))}
      </div>

      <SubmitButton pendingLabel="Saving…">
        {mode === "create" ? "Create adventurer" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
