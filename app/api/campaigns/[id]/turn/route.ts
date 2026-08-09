import { requireUserForApi } from "@/lib/auth/session";
import { beginCampaign, playTurn, type FamilyMoveChoice, type PlayerAction } from "@/lib/engine/play";
import type { TurnProgress } from "@/lib/engine/gm";
import { sseResponse } from "@/lib/http/sse";

export const dynamic = "force-dynamic";
// A turn is three model calls; on a local model that can be well over a minute.
export const maxDuration = 300;

/**
 * Runs one turn and streams progress back as server-sent events.
 *
 * A turn takes 30-90 seconds on a local model, and considerably longer on a
 * machine without a GPU. Without progress the table is staring at a spinner
 * wondering whether it has crashed — so each stage is announced as it starts,
 * and the dice go out the moment they are rolled, which is the part everyone
 * actually wants to see.
 *
 * Between those announcements the stream would otherwise fall silent for the
 * length of a model call, which proxies treat as a dead connection; see
 * lib/http/sse.ts for why that is handled there rather than here.
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
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "begin" | "turn";
    actions?: PlayerAction[];
    familyMove?: FamilyMoveChoice | null;
    /** Set when retelling a turn the table took back. */
    correction?: string | null;
  };

  return sseResponse(async (send) => {
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
          body.correction ?? null,
        );
        send("narration", { text: result.narration });
        send("done", {
          checks: result.checks,
          diagnostics: result.diagnostics,
          sceneComplete: result.extraction.sceneComplete,
          campaignComplete: result.campaignComplete,
        });
      }
    } catch (error) {
      // The table gets a plain explanation, not a stack trace. The most
      // common cause by far is the model server being unreachable.
      send("error", {
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  });
}
