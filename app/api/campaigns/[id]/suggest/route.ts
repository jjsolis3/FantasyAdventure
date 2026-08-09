import { requireUserForApi } from "@/lib/auth/session";
import { suggestActions } from "@/lib/engine/play";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Ideas for a player who has gone blank.
 *
 * A plain JSON response rather than SSE: this is one short model call, and the
 * child pressing it is waiting on an answer rather than watching a story
 * arrive. It writes nothing, so it can be pressed as often as they like.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const body = (await request.json().catch(() => ({}))) as { characterId?: string };
  if (!body.characterId) {
    return Response.json({ error: "Which adventurer?" }, { status: 400 });
  }

  try {
    const suggestions = await suggestActions(id, user.id, body.characterId);
    return Response.json({ suggestions });
  } catch (error) {
    // The table gets a plain sentence. Being unable to offer ideas must never
    // read like the adventure itself has broken.
    return Response.json(
      { error: error instanceof Error ? error.message : "No ideas just now." },
      { status: 502 },
    );
  }
}
