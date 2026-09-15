import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { archiveFilename, householdExport } from "@/lib/game/export";

export const dynamic = "force-dynamic";
// A family with a year of Saturdays behind them is a few megabytes of narration
// to assemble. Nowhere near the limit, but this is not an edge function.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Hands a family everything it has written.
 *
 * A route handler rather than a server action, because the answer is a file and
 * a server action cannot return one. Which also means the guard has to be the
 * API-shaped kind: `requireHouseholdParent` redirects, and a redirect looks like
 * a successful download to anything that follows it — so the household is
 * checked, and then the *scope* is taken from the session and never from the
 * request. There is no household id in this URL to tamper with, deliberately.
 *
 * Either grown-up may take it. A parent and an owner can both already read every
 * one of these pages in the app; a download of what they can already see is not
 * a new permission, and requiring the owner would mean a family whose owner is
 * away cannot get their own data out.
 */
export async function GET(): Promise<Response> {
  const actor = await requireHouseholdParent();

  if (!actor.householdId) {
    return Response.json(
      { error: "This account is not part of a household yet." },
      { status: 400 },
    );
  }

  const archive = await householdExport(actor.householdId);
  if (!archive) {
    return Response.json({ error: "That household could not be found." }, { status: 404 });
  }

  const household = await db.household.findUnique({
    where: { id: actor.householdId },
    select: { name: true },
  });

  // Two spaces, not minified. This is a file a person may open in a text editor
  // to find the evening their daughter named the horse, and the few hundred
  // kilobytes it costs are worth being able to read it.
  const body = JSON.stringify(archive, null, 2);

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${archiveFilename(household?.name ?? "household")}"`,
      // It is everything about one family. Nothing between here and them should
      // keep a copy.
      "cache-control": "no-store, private",
    },
  });
}
