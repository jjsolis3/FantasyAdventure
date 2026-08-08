import { requireAdmin } from "@/lib/auth/session";
import { PageTitle } from "@/components/ui";
import { StorytellerForm } from "@/components/settings/storyteller-form";
import { PROVIDER_PRESETS, apiKeyIsUnreadable, readStoredSettings } from "@/lib/ai/settings";
import { encryptionSecret } from "@/lib/settings/secret-box";

export const dynamic = "force-dynamic";

export default async function StorytellerSettingsPage() {
  await requireAdmin();

  const [settings, keyUnreadable] = await Promise.all([readStoredSettings(), apiKeyIsUnreadable()]);

  // Shown as the starting point when nothing has been saved yet, so a
  // deployment already configured through Coolify does not look empty.
  const envFallback =
    settings === null && process.env.AI_BASE_URL
      ? { baseUrl: process.env.AI_BASE_URL, model: process.env.AI_MODEL ?? "" }
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="Administration"
        title="The storyteller"
        lead="Which model tells your family's story, and whether it can be reached."
      />

      {settings === null ? (
        <p className="mb-6 text-sm text-hearth-400">
          {envFallback
            ? "Nothing saved here yet, so the game is using the environment variables set in Coolify. Saving below takes over from them — and then the model can be changed without a redeploy."
            : "Nothing is configured yet. Pick a preset below to get started."}
        </p>
      ) : null}

      <StorytellerForm
        settings={settings}
        presets={PROVIDER_PRESETS}
        envFallback={envFallback}
        secretConfigured={encryptionSecret() !== null}
        keyUnreadable={keyUnreadable}
      />
    </main>
  );
}
