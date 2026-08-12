import { db } from "@/lib/db";
import { screenFromRequest } from "@/lib/game/screen";

export const dynamic = "force-dynamic";

/**
 * An adventurer's portrait, for a television.
 *
 * This one does take an id, because the party strip needs several at once and
 * there is no way round naming them. So the id is checked rather than trusted:
 * the character must be in the party of the adventure this screen was adopted
 * into. A screen asking for anybody else's adventurer gets a 404, the same as
 * if they did not exist — which, as far as this television is concerned, they
 * do not.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const { characterId } = await params;
  const screen = await screenFromRequest(request);
  if (!screen?.campaignId) return new Response("Not paired.", { status: 404 });

  const member = await db.partyMember.findFirst({
    where: { campaignId: screen.campaignId, characterId },
    select: {
      character: { select: { portrait: { select: { data: true, mimeType: true } } } },
    },
  });
  if (!member?.character.portrait) return new Response("No portrait.", { status: 404 });

  return new Response(Buffer.from(member.character.portrait.data), {
    headers: {
      "Content-Type": member.character.portrait.mimeType,
      // The display appends the version it was told about, so a replaced
      // portrait arrives under a different URL and this can be held onto.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
