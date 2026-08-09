"use client";

import { useActionState, useState } from "react";
import { saveAiSettingsAction } from "@/lib/ai/settings-actions";
import type { FormState } from "@/lib/auth/actions";
import type { ProviderPreset, StoredSettings } from "@/lib/ai/settings";
import { Alert, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConnectionTest } from "./connection-test";

export function StorytellerForm({
  settings,
  presets,
  envFallback,
  secretConfigured,
  keyUnreadable,
}: {
  settings: StoredSettings | null;
  presets: ProviderPreset[];
  /** What the environment provides, shown when nothing is saved yet. */
  envFallback: { baseUrl: string; model: string } | null;
  secretConfigured: boolean;
  keyUnreadable: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(saveAiSettingsAction, null);
  const saved = state !== null && state.error === "";

  const [kind, setKind] = useState(settings?.kind ?? "OPENAI_COMPATIBLE");
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl ?? envFallback?.baseUrl ?? "");
  const [model, setModel] = useState(settings?.model ?? envFallback?.model ?? "");
  const [narrationModel, setNarrationModel] = useState(settings?.narrationModel ?? "");
  const [reasoningEffort, setReasoningEffort] = useState<string>(settings?.reasoningEffort ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);

  function applyPreset(preset: ProviderPreset) {
    setKind(preset.kind);
    setBaseUrl(preset.baseUrl);
    setModel(preset.models[0]);
    setNarrationModel("");
    setReasoningEffort(preset.reasoningEffort);
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        {state?.error ? <Alert>{state.error}</Alert> : null}
        {saved ? <Alert tone="success">Saved. Test the connection below.</Alert> : null}

        {keyUnreadable ? (
          <Alert>
            A key is stored but cannot be decrypted — the encryption secret has changed since it was
            saved. Enter the key again to fix it.
          </Alert>
        ) : null}

        <section>
          <h2 className="font-display mb-1 text-xl text-hearth-100">Start from a preset</h2>
          <p className="mb-3 text-sm text-hearth-400">
            Fills in the connection details. You can change anything afterwards.
          </p>
          <div className="space-y-2">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className="block w-full rounded-lg border border-hearth-800/60 p-3 text-left transition-colors hover:border-hearth-600"
              >
                <span className="block text-hearth-100">
                  {preset.label}
                  {preset.needsKey ? (
                    <span className="ml-2 text-xs text-hearth-400">needs an API key</span>
                  ) : null}
                </span>
                <span className="block text-sm text-hearth-400">{preset.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-5 border-t border-hearth-800/50 pt-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-hearth-200">Connection type</span>
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
            >
              <option value="OPENAI_COMPATIBLE" className="bg-hearth-950">
                OpenAI-compatible (Ollama, OpenAI, OpenRouter, Groq…)
              </option>
              <option value="ANTHROPIC" className="bg-hearth-950">
                Anthropic (Claude)
              </option>
            </select>
          </label>

          <Field
            label="Address"
            name="baseUrl"
            value={baseUrl}
            onChange={setBaseUrl}
            error={state?.fieldErrors?.baseUrl}
            hint="Include the /v1 at the end. Use the server's LAN address — localhost means the app's own container, not your machine."
          />

          <Field
            label="Model"
            name="model"
            value={model}
            onChange={setModel}
            error={state?.fieldErrors?.model}
            hint="Used for the dice and memory steps, which need reliable JSON."
          />

          <Field
            label="Narration model"
            name="narrationModel"
            required={false}
            value={narrationModel}
            onChange={setNarrationModel}
            error={state?.fieldErrors?.narrationModel}
            hint="Optional. A second model used only for the story text — useful when one model writes better prose and another follows JSON more reliably."
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-hearth-200">Reasoning</span>
            <select
              name="reasoningEffort"
              value={reasoningEffort}
              onChange={(event) => setReasoningEffort(event.target.value)}
              className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
            >
              <option value="" className="bg-hearth-950">
                Leave it to the model (don&rsquo;t send the setting)
              </option>
              <option value="none" className="bg-hearth-950">
                None — recommended for Ollama
              </option>
              <option value="low" className="bg-hearth-950">
                Low
              </option>
              <option value="medium" className="bg-hearth-950">
                Medium
              </option>
              <option value="high" className="bg-hearth-950">
                High
              </option>
            </select>
            <p className="mt-1.5 text-sm text-hearth-400">
              Models like Qwen3 think before answering, and the thinking spends the same budget as
              the reply — so a turn can end with an empty answer. Choose <em>None</em> for those. The
              game does its own reasoning: the model only decides whether a roll is needed, the
              server rolls, and the model narrates the result. Leave the first option selected for
              OpenAI, which rejects settings it does not recognise.
            </p>
          </label>

          <div>
            <Field
              label="API key"
              name="apiKey"
              type="password"
              required={false}
              value={apiKey}
              onChange={setApiKey}
              placeholder={settings?.hasApiKey ? "A key is saved — leave blank to keep it" : "Not needed for a local model"}
              error={state?.fieldErrors?.apiKey}
            />
            {settings?.hasApiKey ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-sm text-hearth-400">
                  Saved: <code className="rounded bg-hearth-950/70 px-1.5 py-0.5">{settings.apiKeyHint}</code>
                </span>
                <label className="flex items-center gap-2 text-sm text-hearth-300">
                  <input
                    type="checkbox"
                    name="clearApiKey"
                    checked={clearKey}
                    onChange={(event) => setClearKey(event.target.checked)}
                  />
                  Remove it
                </label>
              </div>
            ) : null}
            {!secretConfigured ? (
              <p className="mt-2 text-sm text-red-300">
                No encryption secret is set, so an API key cannot be stored safely. Add{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5">SETTINGS_SECRET</code> (16+
                characters) to your environment variables and redeploy. Local models need no key, so
                everything else here still works.
              </p>
            ) : (
              <p className="mt-2 text-sm text-hearth-400">
                Stored encrypted. The key itself is never sent back to this page.
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Uncontrolled: nothing else depends on these while typing, and a
                controlled field with a no-op onChange would be read-only. */}
            <Field
              label="Context budget (tokens)"
              name="maxContextTokens"
              type="number"
              defaultValue={String(settings?.maxContextTokens ?? 3000)}
              error={state?.fieldErrors?.maxContextTokens}
              hint="Lower for a small local model."
            />
            <Field
              label="Timeout (ms)"
              name="timeoutMs"
              type="number"
              defaultValue={String(settings?.timeoutMs ?? 120000)}
              error={state?.fieldErrors?.timeoutMs}
              hint="Raise for a big model on modest hardware."
            />
          </div>
        </section>

        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </form>

      <ConnectionTest lastTestedAt={settings?.lastTestedAt ?? null} lastTestOk={settings?.lastTestOk ?? null} lastTestNote={settings?.lastTestNote ?? null} />
    </div>
  );
}
