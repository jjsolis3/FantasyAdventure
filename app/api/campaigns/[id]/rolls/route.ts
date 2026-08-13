import { requireUserForApi } from "@/lib/auth/session";
import { awaitedRolls, cancelRolls, submitRolls } from "@/lib/engine/play";
import type { TurnProgress } from "@/lib/engine/gm";
import { sseResponse } from "@/lib/http/sse";
import { finishRound, currentRound } from "@/lib/game/rounds";

export const dynamic = "force-dynamic";
// The second half of a turn is still two model calls.
export const maxDuration = 300;

/**
 * What the table is being asked to roll.
 *
 * Read from the adventure rather than remembered by a browser, so a phone that
 * locked, a page that reloaded, or a second device joining halfway all see the
 * same question. The dice on the table are the shared state here; this is just
 * the app catching up with them.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  return Response.json({ awaiting: await awaitedRolls(id, user.id) });
}

/**
 * The numbers came off the table. Finish the turn.
 *
 * Streams like a turn does, because from here on it *is* one — narration and
 * extraction still take the best part of a minute on a local model, and the
 * table deserves the same "still thinking" it gets everywhere else.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const body = (await request.json().catch(() => ({}))) as {
    rolls?: { index: number; value: number }[];
  };

  return sseResponse(async (send) => {
    const onProgress = (event: TurnProgress) => send(event.type, event);

    try {
      const result = await submitRolls(id, user.id, body.rolls ?? [], onProgress);

      // Impossible unless a second ask was somehow queued behind this one, and
      // handled rather than asserted because "impossible" here means four
      // people looking at a broken page.
      if ("awaiting" in result) {
        send("done", { awaiting: result.awaiting });
        return;
      }

      // The round has been sitting open and claimed since the turn stopped —
      // it is only now that the turn has actually happened.
      const round = await currentRound(id);
      if (round) await finishRound(round.id);

      send("narration", { text: result.narration });
      send("done", {
        checks: result.checks,
        diagnostics: result.diagnostics,
        sceneComplete: result.extraction.sceneComplete,
        campaignComplete: result.campaignComplete,
      });
    } catch (error) {
      send("error", {
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  });
}

/**
 * Puts the dice back down.
 *
 * For the evening a die goes under the sofa, or the moment somebody realises
 * they meant to say something else. Costs nothing: a turn that stopped never
 * happened, so there is nothing to undo.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  await cancelRolls(id, user.id);
  return Response.json({ ok: true });
}
