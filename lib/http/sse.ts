/**
 * Server-sent events, with a heartbeat.
 *
 * The heartbeat is the whole reason this exists. A turn is three model calls,
 * and on modest hardware a single call can run for minutes with nothing to
 * report. Proxies read that silence as a dead connection — Cloudflare closes an
 * idle tunnel at around 100 seconds — and the table sees a bare "network error"
 * partway through a turn that was still working perfectly well on the server.
 *
 * `X-Accel-Buffering: no` stops proxies buffering the stream, but it does not
 * stop them timing out an idle one. Only bytes do that.
 *
 * A `:` line is an SSE comment: it carries no event and no data, so every
 * client ignores it, but it is traffic, and traffic is what keeps the
 * connection open.
 */

/** Comfortably inside the ~100s idle timeouts proxies typically apply. */
export const HEARTBEAT_MS = 15_000;

export type SseSend = (event: string, data: unknown) => void;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Tells nginx-style proxies not to buffer, which would defeat streaming.
  "X-Accel-Buffering": "no",
} as const;

/**
 * Runs `body`, streaming whatever it sends, and keeps the connection alive
 * while it works. The stream closes when `body` resolves.
 */
export function sseResponse(
  body: (send: SseSend) => Promise<void>,
  options: { heartbeatMs?: number } = {},
): Response {
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let live = true;

      const write = (chunk: string) => {
        if (!live) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client hung up. Stop writing rather than throwing out of a
          // timer callback, where there is nobody to catch it.
          live = false;
        }
      };

      const send: SseSend = (event, data) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const heartbeat = setInterval(() => write(": keep-alive\n\n"), heartbeatMs);

      try {
        await body(send);
      } catch (error) {
        // Callers catch their own failures and report them in domain language.
        // This is the last resort, so that an unexpected throw still reaches
        // the browser as a message rather than as a severed connection.
        send("error", {
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      } finally {
        clearInterval(heartbeat);
        live = false;
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect.
        }
      }
    },
  });

  return new Response(stream, { headers: { ...SSE_HEADERS } });
}
