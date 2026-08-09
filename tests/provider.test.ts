import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { AiUnavailableError, chat, chatStream, probe, readAiConfig } from "../lib/ai/provider.ts";

type Handler = (body: Record<string, unknown>) => {
  status?: number;
  content?: string;
  /** Deltas to emit as SSE frames when the request asked for streaming. */
  stream?: string[];
  raw?: string;
};

/** A stand-in for Ollama / vLLM / LM Studio, so the wire format is really exercised. */
async function withMockServer(handler: Handler, run: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const body = JSON.parse(raw || "{}") as Record<string, unknown>;
      const result = handler(body);

      if (result.status && result.status >= 400) {
        response.writeHead(result.status, { "Content-Type": "text/plain" });
        response.end(result.raw ?? "upstream error");
        return;
      }

      if (body.stream === true) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const delta of result.stream ?? []) {
          response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
        }
        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        result.raw ??
          JSON.stringify({ choices: [{ message: { content: result.content ?? "hello" } }] }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    await run(`http://127.0.0.1:${port}/v1`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function configFor(baseUrl: string, extra: Record<string, string> = {}) {
  return readAiConfig({
    AI_BASE_URL: baseUrl,
    AI_MODEL: "test-model",
    AI_TIMEOUT_MS: "3000",
    ...extra,
  } as unknown as NodeJS.ProcessEnv);
}

// ---- Configuration ---------------------------------------------------------

test("requires a base URL and a model", () => {
  assert.throws(() => readAiConfig({} as unknown as NodeJS.ProcessEnv), AiUnavailableError);
  assert.throws(
    () => readAiConfig({ AI_BASE_URL: "http://x/v1" } as unknown as NodeJS.ProcessEnv),
    /AI_MODEL is not set/,
  );
});

test("trims a trailing slash off the base URL", () => {
  const config = readAiConfig({
    AI_BASE_URL: "http://host:11434/v1/",
    AI_MODEL: "m",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(config.baseUrl, "http://host:11434/v1");
});

test("narration falls back to the main model when not separately configured", () => {
  const shared = readAiConfig({ AI_BASE_URL: "http://x/v1", AI_MODEL: "qwen" } as unknown as NodeJS.ProcessEnv);
  assert.equal(shared.narrationModel, "qwen");

  const split = readAiConfig({
    AI_BASE_URL: "http://x/v1",
    AI_MODEL: "qwen",
    AI_NARRATION_MODEL: "llama3.1",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(split.narrationModel, "llama3.1");
});

// ---- Requests --------------------------------------------------------------

test("sends a well-formed chat completion and reads the reply", async () => {
  let seen: Record<string, unknown> = {};
  await withMockServer(
    (body) => {
      seen = body;
      return { content: "The dragon lifts her head." };
    },
    async (baseUrl) => {
      const reply = await chat(configFor(baseUrl), {
        messages: [{ role: "user", content: "narrate" }],
        temperature: 0.5,
      });
      assert.equal(reply, "The dragon lifts her head.");
    },
  );

  assert.equal(seen.model, "test-model");
  assert.equal(seen.temperature, 0.5);
  assert.equal(seen.stream, false);
  assert.deepEqual(seen.messages, [{ role: "user", content: "narrate" }]);
});

test("asks for JSON mode only when requested", async () => {
  let seen: Record<string, unknown> = {};
  await withMockServer(
    (body) => {
      seen = body;
      return { content: "{}" };
    },
    async (baseUrl) => {
      await chat(configFor(baseUrl), { messages: [{ role: "user", content: "x" }], json: true });
    },
  );
  assert.deepEqual(seen.response_format, { type: "json_object" });

  await withMockServer(
    (body) => {
      seen = body;
      return { content: "x" };
    },
    async (baseUrl) => {
      await chat(configFor(baseUrl), { messages: [{ role: "user", content: "x" }] });
    },
  );
  assert.equal(seen.response_format, undefined);
});

test("routes narration to the narration model when one is configured", async () => {
  let seen: Record<string, unknown> = {};
  await withMockServer(
    (body) => {
      seen = body;
      return { content: "prose" };
    },
    async (baseUrl) => {
      const config = configFor(baseUrl, { AI_NARRATION_MODEL: "llama3.1" });
      await chat(config, { messages: [{ role: "user", content: "x" }], model: config.narrationModel });
    },
  );
  assert.equal(seen.model, "llama3.1");
});

test("sends an Authorization header only when a key is set", async () => {
  await withMockServer(
    () => ({ content: "ok" }),
    async (baseUrl) => {
      // Hosted providers need it; local servers usually ignore it entirely.
      const config = configFor(baseUrl, { AI_API_KEY: "secret" });
      assert.equal(config.apiKey, "secret");
      await chat(config, { messages: [{ role: "user", content: "x" }] });
    },
  );

  const noKey = configFor("http://x/v1");
  assert.equal(noKey.apiKey, null);
});

// ---- Streaming -------------------------------------------------------------

test("reassembles a streamed reply from SSE frames", async () => {
  await withMockServer(
    () => ({ stream: ["The dragon ", "lifts her ", "head."] }),
    async (baseUrl) => {
      const chunks: string[] = [];
      for await (const delta of chatStream(configFor(baseUrl), {
        messages: [{ role: "user", content: "narrate" }],
      })) {
        chunks.push(delta);
      }
      assert.equal(chunks.join(""), "The dragon lifts her head.");
    },
  );
});

test("a malformed frame mid-stream does not abandon the story", async () => {
  const server = createServer((request, response) => {
    request.on("data", () => {});
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "good " } }] })}\n\n`);
      response.write("data: {not json at all\n\n");
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "still here" } }] })}\n\n`);
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const chunks: string[] = [];
    for await (const delta of chatStream(configFor(`http://127.0.0.1:${port}/v1`), {
      messages: [{ role: "user", content: "x" }],
    })) {
      chunks.push(delta);
    }
    assert.equal(chunks.join(""), "good still here");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ---- Failure modes ---------------------------------------------------------

test("reports an upstream error with its status and detail", async () => {
  await withMockServer(
    () => ({ status: 500, raw: "model not loaded" }),
    async (baseUrl) => {
      await assert.rejects(
        chat(configFor(baseUrl), { messages: [{ role: "user", content: "x" }] }),
        (error: unknown) => {
          assert.ok(error instanceof AiUnavailableError);
          assert.match(error.message, /500/);
          assert.match(error.message, /model not loaded/);
          return true;
        },
      );
    },
  );
});

test("reports an unreachable server helpfully rather than cryptically", async () => {
  const config = readAiConfig({
    // Nothing is listening here.
    AI_BASE_URL: "http://127.0.0.1:1/v1",
    AI_MODEL: "m",
    AI_TIMEOUT_MS: "2000",
  } as unknown as NodeJS.ProcessEnv);

  await assert.rejects(
    chat(config, { messages: [{ role: "user", content: "x" }] }),
    (error: unknown) => {
      assert.ok(error instanceof AiUnavailableError);
      assert.match(error.message, /Could not reach the model server/);
      return true;
    },
  );
});

test("rejects a response with no message content", async () => {
  await withMockServer(
    () => ({ raw: JSON.stringify({ choices: [] }) }),
    async (baseUrl) => {
      await assert.rejects(
        chat(configFor(baseUrl), { messages: [{ role: "user", content: "x" }] }),
        /no message content/,
      );
    },
  );
});

test("probe reports reachability without throwing", async () => {
  await withMockServer(
    () => ({ content: "ready" }),
    async (baseUrl) => {
      assert.deepEqual(await probe(configFor(baseUrl)), { ok: true, detail: "ready" });
    },
  );

  const dead = readAiConfig({
    AI_BASE_URL: "http://127.0.0.1:1/v1",
    AI_MODEL: "m",
    AI_TIMEOUT_MS: "1500",
  } as unknown as NodeJS.ProcessEnv);
  const result = await probe(dead);
  assert.equal(result.ok, false);
  assert.match(result.detail, /Could not reach/);
});

// ---- Thinking models -------------------------------------------------------

test("an empty reply is a failure, not a success", async () => {
  // The bug this pins: `typeof "" === "string"`, so an empty answer passed the
  // content check and the connection test reported a reachable model with a
  // blank reply — green on a configuration that cannot finish a turn.
  await withMockServer(
    () => ({ raw: JSON.stringify({ choices: [{ message: { content: "" } }] }) }),
    async (baseUrl) => {
      await assert.rejects(
        () => chat(configFor(baseUrl), { messages: [{ role: "user", content: "hi" }] }),
        /empty reply/i,
      );

      const result = await probe(configFor(baseUrl));
      assert.equal(result.ok, false, "probe must not call an empty reply reachable");
    },
  );
});

test("a model that reasoned away its budget says so", async () => {
  // Qwen3 and friends think by default under Ollama, and the thinking is
  // charged against the same budget as the answer. The message has to name
  // that, because the fix is a setting rather than anything the family can see.
  await withMockServer(
    () => ({
      raw: JSON.stringify({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning: "Okay, the user wants me to…" },
          },
        ],
      }),
    }),
    async (baseUrl) => {
      await assert.rejects(
        () => chat(configFor(baseUrl), { messages: [{ role: "user", content: "hi" }] }),
        (error: Error) => {
          assert.match(error.message, /reasoned/i);
          assert.match(error.message, /none/i, "must name the setting that fixes it");
          return true;
        },
      );
    },
  );
});

test("reasoning_effort is sent only when configured", async () => {
  let seen: Record<string, unknown> = {};

  await withMockServer(
    (body) => {
      seen = body;
      return { content: "ready" };
    },
    async (baseUrl) => {
      // Unset: the field must be absent, because OpenAI rejects values it does
      // not recognise and every provider shares this code path.
      await chat(configFor(baseUrl), { messages: [{ role: "user", content: "hi" }] });
      assert.ok(!("reasoning_effort" in seen), "must not send the field when unconfigured");

      await chat(configFor(baseUrl, { AI_REASONING_EFFORT: "none" }), {
        messages: [{ role: "user", content: "hi" }],
      });
      assert.equal(seen.reasoning_effort, "none");
    },
  );
});

test("an unrecognised reasoning effort is ignored rather than forwarded", () => {
  // Anything invalid must become "off", never reach the wire — a typo in an
  // environment variable should not start rejecting every request.
  assert.equal(configFor("http://x/v1", { AI_REASONING_EFFORT: "maximum" }).reasoningEffort, null);
  assert.equal(configFor("http://x/v1", { AI_REASONING_EFFORT: "" }).reasoningEffort, null);
  assert.equal(configFor("http://x/v1", { AI_REASONING_EFFORT: " NONE " }).reasoningEffort, "none");
});
