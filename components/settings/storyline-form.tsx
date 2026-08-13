"use client";

import { useActionState, useState } from "react";
import { saveStorylineAction } from "@/lib/game/storyline-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert, Field, SelectField } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { READING_LEVEL_OPTIONS, TONE_OPTIONS } from "@/components/campaign/options";

export type ActDraft = {
  title: string;
  goal: string;
  /** One per line, which is how they are typed and how they are read back. */
  beats: string;
  seeks: string;
};

export type StorylineDraft = {
  id?: string;
  title: string;
  tagline: string;
  premise: string;
  hook: string;
  defaultTone: string;
  readingLevel: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedScenes: number;
  pressureName: string;
  isActive: boolean;
  acts: ActDraft[];
};

const BLANK_ACT: ActDraft = { title: "", goal: "", beats: "", seeks: "" };

/**
 * Writing an adventure.
 *
 * The shape on screen is the shape the storyteller is given: a premise it holds
 * throughout, an opening it narrates once, and chapters with a goal, some
 * optional beats and a list of things to find. The labels say what each part
 * actually does to the game, because somebody writing their first adventure has
 * no other way to know why "goal" and "beats" are different boxes.
 */
export function StorylineForm({ initial }: { initial: StorylineDraft }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveStorylineAction, null);
  const [acts, setActs] = useState<ActDraft[]>(
    initial.acts.length > 0 ? initial.acts : [BLANK_ACT, BLANK_ACT, BLANK_ACT],
  );

  function update(index: number, patch: Partial<ActDraft>) {
    setActs((current) => current.map((act, at) => (at === index ? { ...act, ...patch } : act)));
  }

  return (
    <form action={formAction} className="space-y-10">
      {state?.error ? <Alert>{state.error}</Alert> : null}

      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <section className="space-y-5">
        <Field
          label="Title"
          name="title"
          defaultValue={initial.title}
          error={state?.fieldErrors?.title}
        />
        <Field
          label="One line about it"
          name="tagline"
          defaultValue={initial.tagline}
          error={state?.fieldErrors?.tagline}
          hint="What a family reads when choosing. “Something fell out of the sky, and it is frightened.”"
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">Premise</span>
          <textarea
            name="premise"
            defaultValue={initial.premise}
            rows={4}
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          />
          <span className="mt-1.5 block text-sm text-hearth-400">
            What the whole adventure is about. The storyteller is told this every single turn, so
            put the things that must stay true here — who wants what, and why it matters.
          </span>
          {state?.fieldErrors?.premise ? (
            <span className="mt-1 block text-sm text-red-300">{state.fieldErrors.premise}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-hearth-200">The opening</span>
          <textarea
            name="hook"
            defaultValue={initial.hook}
            rows={4}
            className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
          />
          <span className="mt-1.5 block text-sm text-hearth-400">
            The situation the very first scene is narrated from. Write it as a moment, not a
            summary — a door already open, a sound already happening.
          </span>
          {state?.fieldErrors?.hook ? (
            <span className="mt-1 block text-sm text-red-300">{state.fieldErrors.hook}</span>
          ) : null}
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Tone it starts on"
            name="defaultTone"
            defaultValue={initial.defaultTone}
            options={TONE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            hint="A family can change this when they set the adventure up."
          />
          <SelectField
            label="Reading level it suits"
            name="readingLevel"
            defaultValue={initial.readingLevel}
            options={READING_LEVEL_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label="Smallest party"
            name="minPlayers"
            type="number"
            defaultValue={String(initial.minPlayers)}
            error={state?.fieldErrors?.minPlayers}
          />
          <Field
            label="Largest party"
            name="maxPlayers"
            type="number"
            defaultValue={String(initial.maxPlayers)}
            error={state?.fieldErrors?.maxPlayers}
          />
          <Field
            label="Roughly how many scenes"
            name="estimatedScenes"
            type="number"
            defaultValue={String(initial.estimatedScenes)}
            error={state?.fieldErrors?.estimatedScenes}
            hint="Only a hint for pacing."
          />
        </div>

        <Field
          label="What gets worse while they dither"
          name="pressureName"
          defaultValue={initial.pressureName}
          error={state?.fieldErrors?.pressureName}
          hint={
            "The name of this adventure's clock, shown to the table as it fills. " +
            "\u201cThe fog\u201d, \u201cDays until the festival\u201d, \u201cHow high the water is\u201d. " +
            "It moves on a turn that goes nowhere \u2014 never on a bad roll."
          }
        />

        <label className="flex items-start gap-3">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="mt-1" />
          <span>
            <span className="block text-hearth-100">Offer this when starting an adventure</span>
            <span className="block text-sm text-hearth-400">
              Leave it off while you are still writing.
            </span>
          </span>
        </label>
      </section>

      {/* ---- Chapters ---------------------------------------------------- */}
      <section className="space-y-5 border-t border-hearth-800/50 pt-8">
        <div>
          <h2 className="font-display mb-1 text-xl text-hearth-100">Chapters</h2>
          <p className="text-sm text-hearth-400">
            The spine. The storyteller improvises inside whichever chapter the party is in, moves on
            when the chapter is clearly done, and ends the adventure when the last one closes. Three
            is the shape that works: something begins, something is worked out, something is
            settled.
          </p>
        </div>

        {acts.map((act, index) => (
          <div key={index} className="space-y-4 rounded-xl border border-hearth-800/60 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-lg text-hearth-100">Chapter {index + 1}</h3>
              {acts.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setActs((current) => current.filter((_, at) => at !== index))}
                  className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <Field
              label="Chapter name"
              name="actTitle"
              value={act.title}
              onChange={(value) => update(index, { title: value })}
              required={false}
              error={state?.fieldErrors?.[`act.${index}.title`]}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-hearth-200">
                What this chapter is for
              </span>
              <textarea
                name="actGoal"
                value={act.goal}
                onChange={(event) => update(index, { goal: event.target.value })}
                rows={3}
                placeholder="Earn the dragon's trust. She is proud and frightened, and should refuse help until somebody admits a failure of their own."
                className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/40 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              />
              <span className="mt-1.5 block text-sm text-hearth-400">
                Written as instructions to the storyteller, not as description for the players.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-hearth-200">
                Things that could happen — one per line
              </span>
              <textarea
                name="actBeats"
                value={act.beats}
                onChange={(event) => update(index, { beats: event.target.value })}
                rows={3}
                placeholder={"She flinches when she breathes fire, and will not say why\nHer scales change colour with her mood"}
                className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/40 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              />
              <span className="mt-1.5 block text-sm text-hearth-400">
                Optional waypoints, never a script. The storyteller is told to drop them the moment
                the party goes somewhere else, and it will.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-hearth-200">
                Things to find here — one per line
              </span>
              <textarea
                name="actSeeks"
                value={act.seeks}
                onChange={(event) => update(index, { seeks: event.target.value })}
                rows={2}
                placeholder={"a scale she shed when she landed"}
                className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/40 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
              />
              <span className="mt-1.5 block text-sm text-hearth-400">
                These appear on the party&rsquo;s &ldquo;what you have found&rdquo; page as things
                still to look for. The storyteller makes them findable, never compulsory.
              </span>
            </label>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setActs((current) => [...current, BLANK_ACT])}
          className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50"
        >
          Add a chapter
        </button>
      </section>

      <SubmitButton pendingLabel="Saving…">
        {initial.id ? "Save this adventure" : "Create this adventure"}
      </SubmitButton>
    </form>
  );
}
