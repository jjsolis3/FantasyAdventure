/**
 * Talks to any OpenAI-compatible `/v1/chat/completions` endpoint: Ollama,
 * vLLM, LM Studio, llama.cpp server, or a hosted provider.
 *
 * No SDK — the surface used here is small enough that a dependency would cost
 * more than it saves, and this way the same code works against every server.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  messages: ChatMessage[];
  /** Lower for structured output, higher for prose. */
  temperature?: number;
  maxTokens?: number;
  /** Ask the server for JSON when it supports response_format. */
  json?: boolean;
  /** Overrides the configured model — used to route JSON and prose separately. */
  model?: string;
  signal?: AbortSignal;
};

export type ProviderKind = "OPENAI_COMPATIBLE" | "ANTHROPIC";

/**
 * How much a thinking model should reason before answering.
 *
 * Hybrid reasoning models — Qwen3 among them — think by default, and Ollama
 * exposes that through `reasoning_effort` on its OpenAI-compatible endpoint.
 * Thinking is charged against the same output budget as the answer, so a model
 * given 700 tokens can spend all of them reasoning and return an empty string.
 *
 * "none" is usually right here. The pipeline already separates judgement from
 * prose — the model decides whether a check is needed, the *server* rolls, and
 * the model then narrates a result it has been handed — so there is little left
 * for chain-of-thought to add, and a great deal of latency for it to cost.
 */
export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function parseReasoningEffort(value: string | null | undefined): ReasoningEffort | null {
  const normalised = (value ?? "").trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(normalised)
    ? (normalised as ReasoningEffort)
    : null;
}

export type AiConfig = {
  /** Which wire format the endpoint speaks. */
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string | null;
  /** Default model, and the one used for structured work. */
  model: string;
  /** Optional separate model for narration. */
  narrationModel: string;
  timeoutMs: number;
  /** Rough ceiling on prompt size; see lib/ai/context.ts. */
  maxContextTokens: number;
  /**
   * Sent as `reasoning_effort` when set. Left unset by default: OpenAI rejects
   * values it does not recognise, so a field that helps Ollama must not be
   * forced on everyone.
   */
  reasoningEffort: ReasoningEffort | null;
};

export class AiUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const baseUrl = (env.AI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new AiUnavailableError(
      "AI_BASE_URL is not set. Point it at your model server's OpenAI-compatible " +
        "endpoint, e.g. http://192.168.1.50:11434/v1",
    );
  }

  const model = (env.AI_MODEL ?? "").trim();
  if (!model) throw new AiUnavailableError("AI_MODEL is not set, e.g. qwen2.5:latest");

  return {
    kind: (env.AI_PROVIDER ?? "").trim().toUpperCase() === "ANTHROPIC" ? "ANTHROPIC" : "OPENAI_COMPATIBLE",
    baseUrl,
    apiKey: env.AI_API_KEY?.trim() || null,
    model,
    // Local models differ in what they are good at: one may follow a JSON
    // schema reliably while another writes better prose. Routing them
    // separately costs nothing when they are the same model.
    narrationModel: (env.AI_NARRATION_MODEL ?? "").trim() || model,
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 120_000),
    maxContextTokens: Number(env.AI_MAX_CONTEXT_TOKENS ?? 3000),
    reasoningEffort: parseReasoningEffort(env.AI_REASONING_EFFORT),
  };
}

function headersFor(config: AiConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

function bodyFor(config: AiConfig, options: ChatOptions, stream: boolean) {
  return {
    model: options.model ?? config.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 800,
    stream,
    // Servers that do not understand response_format ignore it; those that do
    // become dramatically more reliable. Either way the response is still
    // validated, so this is an optimisation and never a guarantee.
    ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
  };
}

/**
 * Anthropic's Messages API.
 *
 * Kept as a separate function rather than bent into the OpenAI shape: the
 * differences (auth header, version header, system prompt as a top-level
 * field, content returned as blocks) are structural, and pretending otherwise
 * would produce a translation layer that breaks quietly.
 */
async function anthropicChat(config: AiConfig, options: ChatOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  // Anthropic takes the system prompt separately from the conversation.
  const system = options.messages.filter((message) => message.role === "system").map((m) => m.content).join("\n\n");
  const messages = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));

  try {
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: options.model ?? config.model,
        max_tokens: options.maxTokens ?? 800,
        temperature: options.temperature ?? 0.7,
        ...(system ? { system } : {}),
        messages: messages.length > 0 ? messages : [{ role: "user" as const, content: "Continue." }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiUnavailableError(`Anthropic returned ${response.status}. ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
    const text = (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    if (!text) throw new AiUnavailableError("Anthropic returned no text content.");
    return text;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError(
        `Anthropic did not answer within ${Math.round(config.timeoutMs / 1000)}s.`,
        error,
      );
    }
    throw new AiUnavailableError(`Could not reach Anthropic at ${config.baseUrl}.`, error);
  } finally {
    clearTimeout(timeout);
  }
}

/** One non-streaming completion. Returns the assistant's message content. */
export async function chat(config: AiConfig, options: ChatOptions): Promise<string> {
  if (config.kind === "ANTHROPIC") return anthropicChat(config, options);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  // Caller-supplied cancellation has to compose with the timeout.
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: headersFor(config),
      body: JSON.stringify(bodyFor(config, options, false)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiUnavailableError(
        `Model server returned ${response.status}. ${detail.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        // Ollama and several hosted providers return chain-of-thought here,
        // separately from the answer.
        message?: { content?: string; reasoning?: string; reasoning_content?: string };
      }[];
    };
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string") {
      throw new AiUnavailableError("Model server returned no message content.");
    }

    // An empty string is not a usable answer, and treating it as one is how a
    // connection test reports success against a model that cannot finish a
    // turn. Name the likely cause: by far the most common is a thinking model
    // spending the whole output budget before it starts answering.
    if (!content.trim()) {
      const thought = choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? "";
      const budget = options.maxTokens ?? 800;

      if (thought.trim() || choice?.finish_reason === "length") {
        throw new AiUnavailableError(
          `The model reasoned for its entire ${budget}-token budget and never wrote an ` +
            "answer. Models like Qwen3 think by default, and the thinking is charged " +
            "against the same budget as the reply. Set Reasoning to “none” in the " +
            "storyteller settings, or use a model that does not think.",
        );
      }

      throw new AiUnavailableError(
        "The model returned an empty reply. It is reachable, but it is not answering.",
      );
    }

    return content;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError(
        `The model did not answer within ${Math.round(config.timeoutMs / 1000)}s. ` +
          "A larger model on modest hardware may need AI_TIMEOUT_MS raised.",
        error,
      );
    }
    throw new AiUnavailableError(
      `Could not reach the model server at ${config.baseUrl}. Check that it is running, ` +
        "that the address is the server's LAN address rather than localhost, and that " +
        "the server listens on more than loopback — Ollama binds to 127.0.0.1 by default, " +
        "which refuses connections from this container. See docs/ollama.md.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Streaming completion, yielding text deltas as they arrive.
 *
 * Narration is streamed so the table watches the story appear rather than
 * staring at a spinner for thirty seconds — which, on a local model, is a
 * realistic wait.
 */
export async function* chatStream(
  config: AiConfig,
  options: ChatOptions,
): AsyncGenerator<string, void, unknown> {
  if (config.kind === "ANTHROPIC") {
    // Anthropic streams a different event vocabulary. Nothing in the turn
    // pipeline streams (narration is checked before it is shown), so rather
    // than carry an untested second implementation this says so plainly.
    throw new AiUnavailableError("Streaming is not implemented for Anthropic; use chat().");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: headersFor(config),
      body: JSON.stringify(bodyFor(config, options, true)),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new AiUnavailableError(
        `Model server returned ${response.status}. ${detail.slice(0, 300)}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Server-sent events are newline-delimited; a chunk may end mid-line, so
      // the tail stays in the buffer until its newline arrives.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // A malformed frame mid-stream is not worth aborting the story for.
        }
      }
    }
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError(
        `The model stopped responding after ${Math.round(config.timeoutMs / 1000)}s.`,
        error,
      );
    }
    throw new AiUnavailableError(`Could not reach the model server at ${config.baseUrl}.`, error);
  } finally {
    clearTimeout(timeout);
  }
}

/** Quick reachability probe used by the health endpoint and the CLI harness. */
export async function probe(config: AiConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const reply = await chat(config, {
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      maxTokens: 10,
      temperature: 0,
    });
    return { ok: true, detail: reply.trim().slice(0, 100) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
