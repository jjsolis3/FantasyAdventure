import { test } from "node:test";
import assert from "node:assert/strict";
import { sseResponse, HEARTBEAT_MS } from "../lib/http/sse.ts";

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("sse: sends events in order and closes when the body resolves", async () => {
  const response = sseResponse(async (send) => {
    send("step", { label: "one" });
    send("done", { ok: true });
  });

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
  assert.equal(response.headers.get("X-Accel-Buffering"), "no");

  const text = await readAll(response);
  assert.equal(
    text,
    'event: step\ndata: {"label":"one"}\n\nevent: done\ndata: {"ok":true}\n\n',
  );
});

test("sse: emits keep-alive comments while the body is silent", async () => {
  // The failure this guards against: a turn spends minutes inside a single
  // model call, the connection goes quiet, and a proxy closes it — which the
  // table sees as "network error" on a turn that was still running.
  const response = sseResponse(
    async (send) => {
      await sleep(70);
      send("done", { ok: true });
    },
    { heartbeatMs: 20 },
  );

  const text = await readAll(response);
  const beats = text.split(": keep-alive\n\n").length - 1;

  assert.ok(beats >= 2, `expected at least 2 keep-alives during a 70ms silence, got ${beats}`);
  assert.ok(text.endsWith('event: done\ndata: {"ok":true}\n\n'));
});

test("sse: keep-alive frames carry no data, so clients skip them", async () => {
  // Both clients parse frames by looking for a `data:` line and skipping
  // frames without one. A heartbeat must stay invisible to them.
  const response = sseResponse(async () => {
    await sleep(30);
  }, { heartbeatMs: 10 });
  const text = await readAll(response);

  for (const frame of text.split("\n\n").filter(Boolean)) {
    const lines = frame.split("\n");
    assert.ok(
      lines.every((line) => !line.startsWith("data:")),
      `heartbeat frame should carry no data, got ${JSON.stringify(frame)}`,
    );
    assert.ok(lines.every((line) => line.startsWith(":")));
  }
});

test("sse: a throw from the body reaches the client as an error event", async () => {
  const response = sseResponse(async () => {
    throw new Error("model server exploded");
  });

  const text = await readAll(response);
  assert.match(text, /^event: error\n/);
  assert.match(text, /model server exploded/);
});

test("sse: stops writing once the client hangs up", async () => {
  const response = sseResponse(
    async (send) => {
      await sleep(40);
      send("done", { ok: true });
    },
    { heartbeatMs: 5 },
  );

  // Cancelling is what a closed browser tab does. Writing afterwards must not
  // throw out of the heartbeat timer, where nothing could catch it.
  await response.body!.cancel();
  await sleep(30);
});

test("sse: the default heartbeat is inside common proxy idle timeouts", () => {
  // Cloudflare closes an idle tunnel at ~100s; nginx defaults to 60s.
  assert.ok(HEARTBEAT_MS < 60_000 / 2, "heartbeat must beat the tightest common timeout twice over");
});
