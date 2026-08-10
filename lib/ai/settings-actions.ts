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

  // Pictures: a separate service from the prose, and the only thing here that
  // costs money per use, so it is off unless somebody says otherwise.
  imagesEnabled: z.string().optional(),
  imageBaseUrl: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^https?:\/\//i.test(value),
      "Must start with http:// or https://",
    ),
  imageModel: z.string().trim().max(120).optional(),
  imageApiKey: z.string().optional(),
  clearImageApiKey: z.string().optional(),

  // Blank means "not priced", which the usage page reports honestly rather
  // than as zero.
  inputPricePer1M: z.coerce.number().min(0).max(10_000).nullish(),
  outputPricePer1M: z.coerce.number().min(0).max(10_000).nullish(),
  imagePrice: z.coerce.number().min(0).max(1_000).nullish(),
  currency: z.string().trim().max(8).optional(),
});

/** An empty price field means unset, not zero. */
function priceOrNull(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : Number(text);
}

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
    imagesEnabled: formData.get("imagesEnabled") ?? undefined,
    imageBaseUrl: formData.get("imageBaseUrl") ?? undefined,
    imageModel: formData.get("imageModel") ?? undefined,
    imageApiKey: formData.get("imageApiKey") ?? undefined,
    clearImageApiKey: formData.get("clearImageApiKey") ?? undefined,
    inputPricePer1M: priceOrNull(formData.get("inputPricePer1M")),
    outputPricePer1M: priceOrNull(formData.get("outputPricePer1M")),
    imagePrice: priceOrNull(formData.get("imagePrice")),
    currency: formData.get("currency") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const {
    apiKey,
    clearApiKey,
    narrationModel,
    reasoningEffort,
    imagesEnabled,
    imageBaseUrl,
    imageModel,
    imageApiKey,
    clearImageApiKey,
    inputPricePer1M,
    outputPricePer1M,
    imagePrice,
    currency,
    ...rest
  } = parsed.data;

  // Three cases for a key: clear it, replace it, or leave it untouched. The
  // same three for both of them, so the shape is written once.
  let keyFields: { apiKeyCipher?: string | null; apiKeyHint?: string | null } = {};
  let imageKeyFields: { imageApiKeyCipher?: string | null; imageApiKeyHint?: string | null } = {};

  try {
    if (clearApiKey === "on") {
      keyFields = { apiKeyCipher: null, apiKeyHint: null };
    } else if (apiKey && apiKey.trim().length > 0) {
      keyFields = {
        apiKeyCipher: encryptSecret(apiKey.trim(), encryptionSecret()),
        apiKeyHint: hintFor(apiKey),
      };
    }

    if (clearImageApiKey === "on") {
      imageKeyFields = { imageApiKeyCipher: null, imageApiKeyHint: null };
    } else if (imageApiKey && imageApiKey.trim().length > 0) {
      imageKeyFields = {
        imageApiKeyCipher: encryptSecret(imageApiKey.trim(), encryptionSecret()),
        imageApiKeyHint: hintFor(imageApiKey),
      };
    }
  } catch (error) {
    if (error instanceof MissingSecretError) return { error: error.message };
    throw error;
  }

  const wantsImages = imagesEnabled === "on";
  if (wantsImages && (!imageBaseUrl || !imageModel)) {
    return {
      error: "Pictures need somewhere to draw them. Give an address and a model, or switch them off.",
      fieldErrors: {
        ...(imageBaseUrl ? {} : { imageBaseUrl: "Required when pictures are on." }),
        ...(imageModel ? {} : { imageModel: "Required when pictures are on." }),
      },
    };
  }

  const data = {
    ...rest,
    narrationModel: narrationModel?.trim() || null,
    reasoningEffort: reasoningEffort || null,
    imagesEnabled: wantsImages,
    imageBaseUrl: imageBaseUrl?.trim() || null,
    imageModel: imageModel?.trim() || null,
    inputPricePer1M: inputPricePer1M ?? null,
    outputPricePer1M: outputPricePer1M ?? null,
    imagePrice: imagePrice ?? null,
    currency: currency?.trim().toUpperCase() || "USD",
    ...keyFields,
    ...imageKeyFields,
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
