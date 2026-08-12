import { z } from "zod";
import { requireUserForApi } from "@/lib/auth/session";
import { membershipFor } from "@/lib/game/access";
import { pairScreen, screensFor, unpairScreen } from "@/lib/game/screen";

export const dynamic = "force-dynamic";

const pairSchema = z.object({
  code: z.string().min(6).max(16),
  label: z.string().max(40).optional(),
});

const unpairSchema = z.object({ screenId: z.string().min(1) });

/** The televisions showing this adventure. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const membership = await membershipFor(id, user.id);
  if (!membership.isMember) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  return Response.json({ screens: await screensFor(id) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Adopts a television into this adventure.
 *
 * Owner only, and this is the stricter of the two plausible rules. Anyone at
 * the table can *see* the adventure, so letting any of them put it on a
 * television is arguable — but the household that started it is the one that
 * knows which screens are in which room, and putting somebody else's evening on
 * a wall is not a thing to be undoable-after-the-fact.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const membership = await membershipFor(id, user.id);
  if (!membership.isMember) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }
  if (!membership.isOwner) {
    return Response.json(
      { error: "Only the household that started this adventure can send it to a screen." },
      { status: 403 },
    );
  }

  const parsed = pairSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Type the code the television is showing." }, { status: 400 });
  }

  const outcome = await pairScreen(id, parsed.data.code, parsed.data.label);
  if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 400 });

  return Response.json({ screenId: outcome.screenId, screens: await screensFor(id) });
}

/** Takes the adventure back off a television. Owner only, as with pairing. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const membership = await membershipFor(id, user.id);
  if (!membership.isOwner) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  const parsed = unpairSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Which screen?" }, { status: 400 });

  await unpairScreen(id, parsed.data.screenId);
  return Response.json({ screens: await screensFor(id) });
}
