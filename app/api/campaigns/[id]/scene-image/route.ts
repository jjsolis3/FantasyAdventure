import { z } from "zod";
import { requireUserForApi } from "@/lib/auth/session";
import { ensureSceneArt } from "@/lib/engine/scene-art";

export const dynamic = "force-dynamic";
// Drawing is slower than answering, and slower again on a busy afternoon.
export const maxDuration = 180;

const bodySchema = z.object({ sceneId: z.string().min(1) });

/**
 * Asks for the picture of a chapter, drawing it if nobody has yet.
 *
 * Asked for by the page rather than done by the turn, so that a slow or
 * unreachable drawing service can never be the reason a turn takes two minutes
 * or fails outright. A refusal here is ordinary and quiet — the table gets the
 * story either way.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Which chapter?" }, { status: 400 });
  }

  const outcome = await ensureSceneArt(id, user.id, parsed.data.sceneId);
  if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 409 });

  return Response.json({ sceneId: outcome.sceneId, drawn: outcome.drawn });
}
