import { requireUserForApi } from "@/lib/auth/session";
import {
  beginCampaign,
  playTurn,
  talkTurn,
  type FamilyMoveChoice,
  type PlayerAction,
} from "@/lib/engine/play";
import type { TurnProgress } from "@/lib/engine/gm";
import { sseResponse } from "@/lib/http/sse";
import { membershipFor } from "@/lib/game/access";
import { actionsFrom, claimRound, currentRound, failRound, finishRound, recordStage } from "@/lib/game/rounds";

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
 *
 * `mode: "round"` is the same turn, taken on behalf of a party that answered
 * from several devices. The only difference is where the answers come from and
 * that one browser has to be chosen to run it — see the claim below.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "begin" | "turn" | "talk" | "round";
    actions?: PlayerAction[];
    familyMove?: FamilyMoveChoice | null;
    /** Set when retelling a turn the table took back. */
    correction?: string | null;
    /** The round being taken, when the party answered separately. */
    roundId?: string;
  };

  if (body.mode === "round") return takeRound(id, user.id, body.roundId ?? "");

  return sseResponse(async (send) => {
    const onProgress = (event: TurnProgress) => send(event.type, event);

    try {
      if (body.mode === "talk") {
        const result = await talkTurn(id, user.id, body.actions ?? [], onProgress);
        send("narration", { text: result.narration });
        send("done", { talked: true });
      } else if (body.mode === "begin") {
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

        // Stopped rather than finished: the dice are on the table and the
        // storyteller is waiting to be told what they said.
        if ("awaiting" in result) {
          send("done", { awaiting: result.awaiting });
          return;
        }

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

/**
 * Takes the turn the party has been filling in from their own devices.
 *
 * Every browser watching the round tries this the moment the last answer lands,
 * because none of them knows what the others are doing. Which one actually runs
 * the turn is decided by `claimRound`, a conditional update: exactly one wins,
 * and the rest are told to keep watching. Doing it that way means nobody has to
 * be nominated as the host, and closing the winner's laptop does not lose the
 * turn — the claim goes stale and the next browser picks it up.
 *
 * A refusal here has to be JSON rather than an SSE frame: the loser needs a
 * status code it can act on before it starts reading a stream that will never
 * carry a turn.
 */
async function takeRound(campaignId: string, userId: string, roundId: string): Promise<Response> {
  const membership = await membershipFor(campaignId, userId);
  if (!membership.isMember) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  const round = await currentRound(campaignId);
  if (!round || (roundId && round.id !== roundId)) {
    return Response.json({ error: "That round is no longer open." }, { status: 409 });
  }
  if (!round.everyoneIn) {
    return Response.json({ error: "Not everybody has answered yet." }, { status: 409 });
  }
  if (!round.hasActions) {
    return Response.json({ error: "Somebody has to do something." }, { status: 409 });
  }

  if (!(await claimRound(round.id, userId))) {
    // Another browser got there first. Its progress arrives through the state
    // endpoint like everybody else's.
    return Response.json({ resolving: true }, { status: 409 });
  }

  const actions = actionsFrom(round);

  return sseResponse(async (send) => {
    const onProgress = (event: TurnProgress) => {
      send(event.type, event);
      if (event.type === "stage") void recordStage(round.id, event.stage);
    };

    try {
      if (round.mode === "TALK") {
        const result = await talkTurn(campaignId, userId, actions, onProgress);
        await finishRound(round.id);
        send("narration", { text: result.narration });
        send("done", { talked: true });
        return;
      }

      const result = await playTurn(
        campaignId,
        userId,
        actions,
        onProgress,
        round.familyMove,
        round.correction,
      );
      // The table is rolling its own dice, so the turn has stopped rather than
      // finished. The round stays open and stays claimed: the phones are about
      // to be asked for numbers, and a round that reopened here would invite
      // everybody to retype the actions they have already sent.
      if ("awaiting" in result) {
        send("done", { awaiting: result.awaiting });
        return;
      }

      await finishRound(round.id);
      send("narration", { text: result.narration });
      send("done", {
        checks: result.checks,
        diagnostics: result.diagnostics,
        sceneComplete: result.extraction.sceneComplete,
        campaignComplete: result.campaignComplete,
      });
    } catch (error) {
      // Nothing the party typed is thrown away: the round goes back to
      // collecting with the reason attached, and the table can press again.
      const message = error instanceof Error ? error.message : "Something went wrong.";
      await failRound(round.id, message);
      send("error", { message });
    }
  });
}
