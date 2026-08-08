/**
 * Where the storyteller's connection settings come from.
 *
 * Database first, environment as fallback. That ordering matters both ways: a
 * fresh deployment works from Coolify's environment variables before anyone has
 * visited the settings page, and once someone has, the model can be changed
 * from a phone without a redeploy.
 */

import { db } from "@/lib/db";
import { AiUnavailableError, readAiConfig, type AiConfig, type ProviderKind } from "@/lib/ai/provider";
import { decryptSecret, encryptionSecret } from "@/lib/settings/secret-box";

export const SETTINGS_ID = "singleton";

/** Ready-made connections, so nobody has to remember a base URL. */
export type ProviderPreset = {
  key: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Suggested models, best first. */
  models: string[];
  needsKey: boolean;
  blurb: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "ollama",
    label: "Ollama (on your network)",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "http://192.168.1.50:11434/v1",
    models: ["qwen2.5:latest", "llama3.1:latest", "gemma3:latest", "phi3:latest"],
    needsKey: false,
    blurb: "Free, private, and only as good as the hardware it runs on.",
  },
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    kind: "ANTHROPIC",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    needsKey: true,
    blurb: "Strongest narration for a young table, and very reliable at JSON.",
  },
  {
    key: "openai",
    label: "OpenAI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
    needsKey: true,
    blurb: "Widely available, and cheap at the smaller sizes.",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["anthropic/claude-sonnet-4.5", "meta-llama/llama-3.1-70b-instruct"],
    needsKey: true,
    blurb: "One key, many models — useful for comparing before committing.",
  },
  {
    key: "groq",
    label: "Groq",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile"],
    needsKey: true,
    blurb: "Very fast, which matters when a turn is three calls.",
  },
];

export type StoredSettings = {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  narrationModel: string;
  maxContextTokens: number;
  timeoutMs: number;
  /** Never the key itself — only enough to recognise it. */
  apiKeyHint: string | null;
  hasApiKey: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestNote: string | null;
};

/** What the settings page shows. Safe to hand to the browser. */
export async function readStoredSettings(): Promise<StoredSettings | null> {
  const row = await db.aiSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return null;

  return {
    kind: row.kind,
    baseUrl: row.baseUrl,
    model: row.model,
    narrationModel: row.narrationModel ?? "",
    maxContextTokens: row.maxContextTokens,
    timeoutMs: row.timeoutMs,
    apiKeyHint: row.apiKeyHint,
    hasApiKey: row.apiKeyCipher !== null,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    lastTestNote: row.lastTestNote,
  };
}

/**
 * The configuration the engine actually uses.
 *
 * Throws AiUnavailableError with an actionable message when nothing is
 * configured, because "fetch failed" tells a parent nothing.
 */
export async function resolveAiConfig(): Promise<AiConfig> {
  const row = await db.aiSetting.findUnique({ where: { id: SETTINGS_ID } }).catch(() => null);

  if (!row) {
    // No settings saved yet: fall back to the environment, which is how a
    // fresh deployment works before anyone opens the settings page.
    try {
      return readAiConfig();
    } catch {
      throw new AiUnavailableError(
        "The storyteller has not been set up yet. An administrator can configure it " +
          "at Settings → Storyteller.",
      );
    }
  }

  const secret = encryptionSecret();
  const stored = decryptSecret(row.apiKeyCipher, secret);

  // A saved key that will not decrypt means the secret changed. Falling back to
  // the environment key is better than sending an empty one and getting a 401.
  const apiKey = stored ?? process.env.AI_API_KEY?.trim() ?? null;

  return {
    kind: row.kind,
    baseUrl: row.baseUrl.replace(/\/+$/, ""),
    apiKey: apiKey || null,
    model: row.model,
    narrationModel: row.narrationModel?.trim() || row.model,
    timeoutMs: row.timeoutMs,
    maxContextTokens: row.maxContextTokens,
  };
}

/** True when a saved API key exists but cannot be decrypted with the current secret. */
export async function apiKeyIsUnreadable(): Promise<boolean> {
  const row = await db.aiSetting.findUnique({ where: { id: SETTINGS_ID } }).catch(() => null);
  if (!row?.apiKeyCipher) return false;
  return decryptSecret(row.apiKeyCipher, encryptionSecret()) === null;
}
