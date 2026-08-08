import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import {
  MissingSecretError,
  decryptSecret,
  encryptSecret,
  encryptionSecret,
  hintFor,
} from "../lib/settings/secret-box.ts";
import { chat, readAiConfig, AiUnavailableError } from "../lib/ai/provider.ts";

const SECRET = "a-secret-at-least-sixteen-chars";

// ---- Encryption ------------------------------------------------------------

test("a secret round-trips", () => {
  const cipher = encryptSecret("sk-ant-example-key", SECRET);
  assert.equal(decryptSecret(cipher, SECRET), "sk-ant-example-key");
});

test("the ciphertext does not contain the plaintext", () => {
  const cipher = encryptSecret("sk-ant-example-key", SECRET);
  assert.ok(!cipher.includes("sk-ant-example-key"));
  assert.ok(!cipher.includes("example"));
});

test("the same value encrypts differently every time", () => {
  // A fresh nonce per encryption, so identical keys do not produce identical rows.
  const a = encryptSecret("same", SECRET);
  const b = encryptSecret("same", SECRET);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a, SECRET), "same");
  assert.equal(decryptSecret(b, SECRET), "same");
});

test("the wrong secret does not decrypt", () => {
  const cipher = encryptSecret("sk-ant-example-key", SECRET);
  assert.equal(decryptSecret(cipher, "a-different-secret-entirely"), null);
});

test("tampered ciphertext is rejected rather than returned mangled", () => {
  const cipher = encryptSecret("sk-ant-example-key", SECRET);
  const parts = cipher.split(":");
  // Flip a character in the ciphertext segment.
  parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith("A") ? "B" : "A");
  assert.equal(decryptSecret(parts.join(":"), SECRET), null);
});

test("malformed payloads degrade to null rather than throwing", () => {
  for (const bad of ["", "nonsense", "v1:only:three", "v9:a:b:c"]) {
    assert.equal(decryptSecret(bad, SECRET), null, bad);
  }
});

test("storing a key without a secret is refused, not silently done in the clear", () => {
  assert.throws(() => encryptSecret("sk-ant-example-key", null), MissingSecretError);
});

test("a too-short secret counts as no secret", () => {
  // Worse than none, because it looks configured.
  assert.equal(encryptionSecret({ SETTINGS_SECRET: "short" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(
    encryptionSecret({ SETTINGS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv),
    SECRET,
  );
});

test("AUTH_SECRET is accepted as a fallback", () => {
  assert.equal(
    encryptionSecret({ AUTH_SECRET: SECRET } as unknown as NodeJS.ProcessEnv),
    SECRET,
  );
  // SETTINGS_SECRET wins when both are present.
  assert.equal(
    encryptionSecret({
      AUTH_SECRET: SECRET,
      SETTINGS_SECRET: "the-preferred-secret-value",
    } as unknown as NodeJS.ProcessEnv),
    "the-preferred-secret-value",
  );
});

test("the hint identifies a key without revealing it", () => {
  const hint = hintFor("sk-ant-api03-abcdefghijklmnop-4f2a");
  assert.ok(hint.length < 20, hint);
  assert.ok(!hint.includes("abcdefghijklmnop"));
  assert.match(hint, /^sk-ant/);
  assert.match(hint, /4f2a$/);
  // Short values are hidden entirely rather than mostly shown.
  assert.equal(hintFor("abc"), "••••");
});

// ---- The Anthropic adapter -------------------------------------------------

async function withAnthropicMock(
  handler: (body: Record<string, unknown>, headers: Record<string, string | string[] | undefined>) => unknown,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const payload = handler(JSON.parse(raw || "{}"), request.headers);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
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

function anthropicConfig(baseUrl: string) {
  return readAiConfig({
    AI_PROVIDER: "anthropic",
    AI_BASE_URL: baseUrl,
    AI_MODEL: "claude-sonnet-5",
    AI_API_KEY: "sk-ant-test",
    AI_TIMEOUT_MS: "3000",
  } as unknown as NodeJS.ProcessEnv);
}

test("the provider kind is read from the environment", () => {
  assert.equal(anthropicConfig("http://x/v1").kind, "ANTHROPIC");
  assert.equal(
    readAiConfig({ AI_BASE_URL: "http://x/v1", AI_MODEL: "m" } as unknown as NodeJS.ProcessEnv).kind,
    "OPENAI_COMPATIBLE",
  );
});

test("Anthropic requests use its own auth and version headers", async () => {
  let seenHeaders: Record<string, string | string[] | undefined> = {};
  await withAnthropicMock(
    (_body, headers) => {
      seenHeaders = headers;
      return { content: [{ type: "text", text: "ready" }] };
    },
    async (baseUrl) => {
      await chat(anthropicConfig(baseUrl), { messages: [{ role: "user", content: "hello" }] });
    },
  );

  assert.equal(seenHeaders["x-api-key"], "sk-ant-test");
  assert.equal(seenHeaders["anthropic-version"], "2023-06-01");
  // Anthropic does not use a bearer token.
  assert.equal(seenHeaders["authorization"], undefined);
});

test("the system prompt is lifted out of the message list", async () => {
  let body: Record<string, unknown> = {};
  await withAnthropicMock(
    (received) => {
      body = received;
      return { content: [{ type: "text", text: "ok" }] };
    },
    async (baseUrl) => {
      await chat(anthropicConfig(baseUrl), {
        messages: [
          { role: "system", content: "You are the Game Master." },
          { role: "user", content: "Narrate." },
        ],
      });
    },
  );

  assert.equal(body.system, "You are the Game Master.");
  assert.deepEqual(body.messages, [{ role: "user", content: "Narrate." }]);
});

test("text is reassembled from content blocks", async () => {
  await withAnthropicMock(
    () => ({
      content: [
        { type: "text", text: "The dragon " },
        { type: "text", text: "lifts her head." },
      ],
    }),
    async (baseUrl) => {
      const reply = await chat(anthropicConfig(baseUrl), {
        messages: [{ role: "user", content: "x" }],
      });
      assert.equal(reply, "The dragon lifts her head.");
    },
  );
});

test("non-text blocks are ignored rather than stringified into the story", async () => {
  await withAnthropicMock(
    () => ({
      content: [
        { type: "thinking", thinking: "internal" },
        { type: "text", text: "Only this." },
      ],
    }),
    async (baseUrl) => {
      const reply = await chat(anthropicConfig(baseUrl), {
        messages: [{ role: "user", content: "x" }],
      });
      assert.equal(reply, "Only this.");
    },
  );
});

test("an empty Anthropic reply is an error, not an empty scene", async () => {
  await withAnthropicMock(
    () => ({ content: [] }),
    async (baseUrl) => {
      await assert.rejects(
        chat(anthropicConfig(baseUrl), { messages: [{ role: "user", content: "x" }] }),
        (error: unknown) => {
          assert.ok(error instanceof AiUnavailableError);
          assert.match(error.message, /no text content/);
          return true;
        },
      );
    },
  );
});

test("a conversation with no user message still sends something valid", async () => {
  // Anthropic rejects an empty messages array; a system-only prompt must not
  // produce one.
  let body: Record<string, unknown> = {};
  await withAnthropicMock(
    (received) => {
      body = received;
      return { content: [{ type: "text", text: "ok" }] };
    },
    async (baseUrl) => {
      await chat(anthropicConfig(baseUrl), {
        messages: [{ role: "system", content: "Only a system prompt." }],
      });
    },
  );

  assert.ok(Array.isArray(body.messages) && (body.messages as unknown[]).length > 0);
});
