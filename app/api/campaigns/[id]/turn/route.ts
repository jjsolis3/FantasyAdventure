import { requireUser } from "@/lib/auth/session";
import { beginCampaign, playTurn, type FamilyMoveChoice, type PlayerAction } from "@/lib/engine/play";
import type { TurnProgress } from "@/lib/engine/gm";

export const dynamic = "force-dynamic";
// A turn is three model calls; on a local model that can be well over a minute.
export const maxDuration = 300;

/**
 * Runs one turn and streams progress back as server-sent events.
 *
 * A turn takes 30-90 seconds on a local model. Without progress the table is
 * staring at a spinner wondering whether it has crashed — so each stage is
 * announced as it starts, and the dice go out the moment they are rolled,
 * which is the part everyone actually wants to see.
 *
 * The narration itself is **not** streamed token by token. It is checked
 * against the safety guard before any of it is shown, and a guard that runs
 * after the children have already read the text is not a guard. The client
 * types it out on arrival instead, which reads as live without the risk.
 *
 * SSE rather than WebSockets: it passes through Coolify's proxy and a
 * Cloudflare tunnel with no extra configuration.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "begin" | "turn";
    actions?: PlayerAction[];
    familyMove?: FamilyMoveChoice | null;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const onProgress = (event: TurnProgress) => send(event.type, event);

      try {
        if (body.mode === "begin") {
          const result = await beginCampaign(id, user.id, onProgress);
          send("narration", { text: result.narration });
          send("done", { sceneId: result.sceneId });
        } else {
          const result = await playTurn(
            id,
            user.id,
            body.actions ?? [],
            onProgress,
            body.familyMove ?? null,
          );
          send("narration", { text: result.narration });
          send("done", {
            checks: result.checks,
            diagnostics: result.diagnostics,
            sceneComplete: result.extraction.sceneComplete,
          });
        }
      } catch (error) {
        // The table gets a plain explanation, not a stack trace. The most
        // common cause by far is the model server being unreachable.
        send("error", {
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx-style proxies not to buffer, which would defeat streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
