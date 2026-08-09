import { db } from "@/lib/db";
import { requireUserForApi } from "@/lib/auth/session";
import { memberCampaignFilter } from "@/lib/game/access";
import { currentRound } from "@/lib/game/rounds";

export const dynamic = "force-dynamic";

/**
 * What everyone else's screen needs to stay in step.
 *
 * Polled rather than pushed. A turn already holds one long-lived SSE stream
 * open per browser, and a second one per idle watcher — through Coolify's proxy
 * and possibly a Cloudflare tunnel — buys very little for a table of four: the
 * thing being watched changes every minute or two, not every frame.
 *
 * Deliberately small. Nothing here is the transcript; when `version` changes,
 * the page refetches itself from the server it already trusts, which keeps one
 * rendering of the story rather than two that can disagree.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    select: {
      status: true,
      inputMode: true,
      turnCounter: true,
      updatedAt: true,
      party: { select: { characterId: true } },
    },
  });
  if (!campaign) {
    return Response.json({ error: "Adventure not found." }, { status: 404 });
  }

  const round = campaign.inputMode === "OWN_DEVICE" ? await currentRound(id) : null;

  // Everything that means "the page you are looking at is out of date": a turn
  // was taken, somebody joined, the adventure ended, the table switched to one
  // screen. Compared as a string, so adding to it later needs no new plumbing.
  const version = [
    campaign.status,
    campaign.inputMode,
    campaign.turnCounter,
    campaign.party.length,
    round?.id ?? "-",
    round?.status ?? "-",
  ].join(":");

  return Response.json(
    {
      version,
      status: campaign.status,
      inputMode: campaign.inputMode,
      turnCounter: campaign.turnCounter,
      round,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
