import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { duplicateStorylineAction, setStorylineActiveAction } from "@/lib/game/storyline-actions";
import { visibleStorylineWhere } from "@/lib/game/visibility";
import { entitlementsOf } from "@/lib/billing/usage";
import { Alert, Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { READING_LEVEL_LABELS, TONE_LABELS } from "@/components/campaign/options";

export const dynamic = "force-dynamic";

/**
 * The adventures a family has written, and the ones they can start from.
 *
 * Ten ship with the game, and ten is enough for a while and then abruptly is
 * not — particularly for a family who know what their own children find
 * frightening far better than a seed file does. Writing one meant editing
 * TypeScript and redeploying, and then for a while it meant being the person
 * who ran the server, which for every family except one is the same answer.
 *
 * **Copying is on this page on purpose, above writing from scratch.** A blank
 * premise box is a much harder job than changing the ending of a story you have
 * already played together, and the second is the one a nine-year-old will
 * actually sit down for. The copy is yours the moment it is made — the seed
 * will never touch it, and editing it cannot take the original away from
 * anybody.
 */
export default async function FamilyAdventuresPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = await requireHouseholdParent();
  const { saved } = await searchParams;

  if (!actor.householdId) redirect("/settings");

  const [mine, startingPoints] = await Promise.all([
    db.storyline.findMany({
      // Theirs alone. A shared one they wrote keeps appearing here, because
      // sharing changed who else can read it rather than who it belongs to.
      where: { householdId: actor.householdId, scope: { in: ["HOUSEHOLD", "COMMUNITY"] } },
      include: { _count: { select: { acts: true, campaigns: true } } },
      orderBy: [{ isActive: "desc" }, { title: "asc" }],
    }),
    db.storyline.findMany({
      where: { isActive: true, ...visibleStorylineWhere(actor.householdId) },
      select: { id: true, title: true, tagline: true, householdId: true },
      orderBy: { title: "asc" },
    }),
  ]);

  // "Everything except our own", excluded here rather than in the query.
  //
  // `NOT: { householdId: ours }` reads as that and is not that: in SQL a
  // comparison against NULL is NULL rather than true, so it silently dropped
  // every adventure that ships with the game — the entire contents of this
  // list, which is how it was noticed. The set is a dozen rows on the largest
  // installation, and a filter that is obviously right beats a `where` clause
  // that is subtly wrong.
  const canCopy = startingPoints.filter(
    (storyline) => storyline.householdId !== actor.householdId,
  );

  // Writing a *new* one is what a plan gates. Everything already written stays
  // editable and playable whatever the family pays — the ceiling asks "may I
  // add one more", and never reaches back for what is already there.
  const entitlements = await entitlementsOf(actor.householdId);
  const mayWrite = entitlements.writeAdventures;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your household"
        title="Your adventures"
        lead="Stories you have written yourselves. Nobody outside this family can see them — not even a family you adventure with."
      />

      <p className="mb-6">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      {saved ? <Alert tone="success">Saved.</Alert> : null}

      {mayWrite ? null : (
        <Card className="mb-6 border-hearth-700/50">
          <h2 className="font-display mb-2 text-xl text-hearth-100">
            Writing comes with a larger plan
          </h2>
          <p className="text-sm text-hearth-200/70">
            A story about your own street, with your own cat in it, is the one thing here you
            cannot get off a shelf. Anything this family has already written stays yours — it is
            still listed below, still playable and still editable.
          </p>
          <p className="mt-3">
            <Link
              href="/settings/store"
              className="inline-block rounded-lg bg-hearth-600 px-4 py-2 text-sm font-medium text-hearth-50 hover:bg-hearth-500"
            >
              See what a larger plan opens
            </Link>
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="font-display mb-2 text-xl text-hearth-100">Start from one you know</h2>
        <p className="mb-4 text-sm text-hearth-200/70">
          A copy is the easiest way in — change the ending, move it to your own street, put the
          cat in it. It arrives switched off and belongs to this family, so nothing you do to it
          touches the one you copied.
        </p>

        {!mayWrite ? (
          <p className="text-sm text-hearth-400">
            Copying one is part of writing your own, so it comes with the same plan.
          </p>
        ) : canCopy.length === 0 ? (
          <p className="text-sm text-hearth-400">There is nothing to copy yet.</p>
        ) : (
          <form action={duplicateStorylineAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="surface" value="household" />
            <label className="flex flex-1 flex-col gap-1 text-sm text-hearth-300">
              Adventure
              <select
                name="storylineId"
                defaultValue={canCopy[0]?.id}
                className="rounded-lg border border-hearth-700 bg-hearth-900/60 px-3 py-2 text-hearth-100"
              >
                {canCopy.map((storyline) => (
                  <option key={storyline.id} value={storyline.id}>
                    {storyline.title}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton variant="secondary" pendingLabel="Copying…">
              Make it ours
            </SubmitButton>
          </form>
        )}
      </Card>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="font-display flex-1 text-xl text-hearth-100">
          Written by this family <span className="text-base text-hearth-400">({mine.length})</span>
        </h2>
        {mayWrite ? (
          <Link
            href="/settings/adventures/new"
            className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-100 hover:border-hearth-600"
          >
            Write one from scratch
          </Link>
        ) : null}
      </div>

      {mine.length === 0 ? (
        <Card>
          <p className="text-sm text-hearth-300">
            None yet. Copying one above is the easier way to start, and the copy is yours to take
            apart.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {mine.map((storyline) => (
            <Card key={storyline.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg text-hearth-100">
                  <Link href={`/settings/adventures/${storyline.id}`} className="hover:underline">
                    {storyline.title}
                  </Link>
                </h3>
                <span className="text-sm text-hearth-400">
                  {storyline._count.acts} {storyline._count.acts === 1 ? "chapter" : "chapters"}
                  {storyline._count.campaigns > 0
                    ? ` · played ${storyline._count.campaigns} ${
                        storyline._count.campaigns === 1 ? "time" : "times"
                      }`
                    : ""}
                </span>
              </div>

              <p className="mt-1 text-sm text-hearth-200/70">{storyline.tagline}</p>

              <p className="mt-2 text-xs text-hearth-500">
                {TONE_LABELS[storyline.defaultTone] ?? storyline.defaultTone} ·{" "}
                {READING_LEVEL_LABELS[storyline.readingLevel] ?? storyline.readingLevel}
                {storyline.scope === "COMMUNITY" ? (
                  <span className="text-moss-400">
                    {" "}
                    · shared with every family here
                  </span>
                ) : null}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <form action={setStorylineActiveAction}>
                  <input type="hidden" name="storylineId" value={storyline.id} />
                  <input type="hidden" name="active" value={storyline.isActive ? "false" : "true"} />
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    {storyline.isActive ? "Put it away" : "Offer it when setting up"}
                  </SubmitButton>
                </form>
                <span className="text-xs text-hearth-500">
                  {storyline.isActive
                    ? "Offered when you set up an adventure."
                    : "Hidden until you switch it on."}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-8 text-sm text-hearth-400">
        There is no delete, deliberately. An adventure already being played holds the premise and
        the chapter the party are in, and a finished one is what a journal is about — so putting it
        away is as far as this goes.
      </p>
    </main>
  );
}
