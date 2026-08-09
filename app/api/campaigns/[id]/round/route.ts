import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserForApi } from "@/lib/auth/session";
import { membershipFor } from "@/lib/game/access";
import {
  answerRound,
  cancelRound,
  currentRound,
  openRound,
  setRoundCorrection,
  setRoundFamilyMove,
  withdrawAnswer,
} from "@/lib/game/rounds";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), mode: z.enum(["ACTION", "TALK"]) }),
  z.object({
    action: z.literal("answer"),
    characterId: z.string().min(1),
    text: z.string().max(2000),
    waiting: z.boolean().default(false),
  }),
  z.object({ action: z.literal("withdraw"), characterId: z.string().min(1) }),
  z.object({
    action: z.literal("move"),
    familyMove: z
      .object({ key: z.string().min(1), helperId: z.string().min(1), targetId: z.string().min(1) })
      .nullable(),
  }),
  z.object({ action: z.literal("correction"), correction: z.string().max(2000) }),
  z.object({ action: z.literal("cancel") }),
]);

/**
 * Everything a player does to a round *except* take the turn.
 *
 * Taking the turn stays on the turn route, which already knows how to stream a
 * pipeline that runs for minutes. This one is short, ordinary JSON: it answers,
 * changes an answer, or puts the round away.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "That request did not make sense." }, { status: 400 });
  }
  const body = parsed.data;

  const membership = await membershipFor(id, user.id);
  if (!membership.isMember) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  const campaign = await db.campaign.findUnique({
    where: { id },
    select: { status: true, inputMode: true },
  });
  if (!campaign) return Response.json({ error: "Adventure not found." }, { status: 404 });

  if (campaign.inputMode !== "OWN_DEVICE") {
    return Response.json(
      { error: "This adventure is being played on one shared screen." },
      { status: 409 },
    );
  }

  if (body.action === "open") {
    if (campaign.status !== "ACTIVE") {
      return Response.json({ error: "This adventure is not in progress." }, { status: 409 });
    }
    return Response.json({ round: await openRound(id, body.mode) });
  }

  if (body.action === "cancel") {
    await cancelRound(id);
    return Response.json({ round: null });
  }

  const round = await currentRound(id);
  if (!round) {
    return Response.json({ error: "There is no round open." }, { status: 409 });
  }
  // Once a browser has the turn, the answers behind it are what is being told.
  if (round.status !== "COLLECTING") {
    return Response.json({ round, error: "The turn has already started." }, { status: 409 });
  }

  switch (body.action) {
    case "answer":
    case "withdraw": {
      // You answer for the adventurers you built. The household that started
      // the adventure may answer for anyone, which is how a child too small for
      // an account of their own still gets a say.
      if (!membership.controlledCharacterIds.includes(body.characterId)) {
        return Response.json({ error: "That adventurer is not yours to speak for." }, { status: 403 });
      }

      if (body.action === "answer") {
        if (!body.waiting && body.text.trim().length === 0) {
          return Response.json({ error: "Say what you are doing first." }, { status: 400 });
        }
        await answerRound(round.id, {
          characterId: body.characterId,
          userId: user.id,
          text: body.text,
          waiting: body.waiting,
        });
      } else {
        await withdrawAnswer(round.id, body.characterId);
      }
      break;
    }

    case "move":
      await setRoundFamilyMove(round.id, body.familyMove);
      break;

    case "correction":
      await setRoundCorrection(round.id, body.correction);
      break;
  }

  return Response.json({ round: await currentRound(id) });
}
