"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";
import { SETTINGS_ID } from "@/lib/ai/settings";
import { MissingSecretError, encryptSecret, encryptionSecret, hintFor } from "@/lib/settings/secret-box";

const settingsSchema = z.object({
  kind: z.enum(["OPENAI_COMPATIBLE", "ANTHROPIC"]),
  baseUrl: z
    .string()
    .trim()
    .min(1, "Where should the storyteller be reached?")
    .refine((value) => /^https?:\/\//i.test(value), "Must start with http:// or https://"),
  model: z.string().trim().min(1, "Which model should it use?").max(120),
  narrationModel: z.string().trim().max(120).optional(),
  maxContextTokens: z.coerce.number().int().min(500).max(200_000),
  // "" means leave the field off the request — required for providers that
  // reject values they do not recognise.
  reasoningEffort: z.enum(["", "none", "low", "medium", "high"]).optional(),
  timeoutMs: z.coerce.number().int().min(5_000).max(600_000),
  // Empty means "leave whatever is stored alone"; the field is write-only.
  apiKey: z.string().optional(),
  clearApiKey: z.string().optional(),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

export async function saveAiSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = settingsSchema.safeParse({
    kind: formData.get("kind"),
    baseUrl: formData.get("baseUrl"),
    model: formData.get("model"),
    narrationModel: formData.get("narrationModel") ?? undefined,
    maxContextTokens: formData.get("maxContextTokens"),
    reasoningEffort: formData.get("reasoningEffort") ?? undefined,
    timeoutMs: formData.get("timeoutMs"),
    apiKey: formData.get("apiKey") ?? undefined,
    clearApiKey: formData.get("clearApiKey") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { apiKey, clearApiKey, narrationModel, reasoningEffort, ...rest } = parsed.data;

  // Three cases for the key: clear it, replace it, or leave it untouched.
  let keyFields: { apiKeyCipher?: string | null; apiKeyHint?: string | null } = {};

  if (clearApiKey === "on") {
    keyFields = { apiKeyCipher: null, apiKeyHint: null };
  } else if (apiKey && apiKey.trim().length > 0) {
    try {
      keyFields = {
        apiKeyCipher: encryptSecret(apiKey.trim(), encryptionSecret()),
        apiKeyHint: hintFor(apiKey),
      };
    } catch (error) {
      if (error instanceof MissingSecretError) return { error: error.message };
      throw error;
    }
  }

  const data = {
    ...rest,
    narrationModel: narrationModel?.trim() || null,
    reasoningEffort: reasoningEffort || null,
    ...keyFields,
    updatedById: admin.id,
    // Any change invalidates the previous test result.
    lastTestedAt: null,
    lastTestOk: null,
    lastTestNote: null,
  };

  await db.aiSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });

  revalidatePath("/settings/storyteller");
  return { error: "" };
}
