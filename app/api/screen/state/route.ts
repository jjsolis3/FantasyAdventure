import { screenFromRequest, screenView } from "@/lib/game/screen";

export const dynamic = "force-dynamic";

/**
 * What the television should be showing.
 *
 * Answers three different situations with three different shapes, because the
 * display has three different things to say: this token is not real (start
 * over), it is real but nobody has adopted you yet (keep showing the code), and
 * here is the adventure.
 */
export async function GET(request: Request) {
  const screen = await screenFromRequest(request);

  // Forgotten rather than forbidden. A token that no longer resolves usually
  // means the family unpaired this television or it sat unused for a fortnight
  // — so the display should quietly ask for a new code, not show an error.
  if (!screen) {
    return Response.json({ state: "unknown" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (!screen.campaignId) {
    return Response.json(
      { state: "waiting" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const view = await screenView(screen.campaignId);
  if (!view) {
    // The adventure was deleted out from under it. The cascade will have
    // removed this row too; the display asks for a new code.
    return Response.json({ state: "unknown" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(
    { state: "paired", label: screen.label, view },
    { headers: { "Cache-Control": "no-store" } },
  );
}
