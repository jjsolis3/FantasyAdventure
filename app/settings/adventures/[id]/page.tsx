import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { mayEditStoryline } from "@/lib/game/visibility";
import { Alert, Card, PageTitle } from "@/components/ui";
import { StorylineForm } from "@/components/settings/storyline-form";

export const dynamic = "force-dynamic";

/**
 * Editing an adventure this family wrote.
 *
 * Deliberately narrower than the administrator's version of this screen, and
 * not by hiding things. There is no chapter-picture panel here: a chapter
 * picture is stored by slug and used by *everybody* who plays that adventure,
 * which makes it an installation-wide asset sitting on a family's private
 * story. Until that is scoped too, drawing one is the operator's job.
 *
 * The guard is `mayEditStoryline`, the same function the action asks. A screen
 * that decided this for itself would be a second answer to the same question,
 * and the wrong one the first time the two drifted.
 */
export default async function EditFamilyAdventurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireHouseholdParent();
  if (!actor.householdId) redirect("/settings");

  const storyline = await db.storyline.findUnique({
    where: { id },
    include: {
      acts: { orderBy: { index: "asc" } },
      _count: { select: { campaigns: true } },
    },
  });
  if (!storyline) notFound();

  // Not found rather than forbidden. A family asking after another family's
  // adventure should not learn that it exists — the same reason a stranger's
  // adventurer 404s rather than refusing.
  if (!mayEditStoryline(actor, storyline) || storyline.householdId !== actor.householdId) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle eyebrow="Your adventures" title={storyline.title} lead={storyline.tagline} />

      <div className="mb-6">
        <Link
          href="/settings/adventures"
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          ← Your adventures
        </Link>
      </div>

      {storyline._count.campaigns > 0 ? (
        <div className="mb-6">
          <Alert tone="info">
            {storyline._count.campaigns}{" "}
            {storyline._count.campaigns === 1 ? "adventure is" : "adventures are"} being played from
            this. Changing the premise or the chapters changes what the storyteller is working from
            in {storyline._count.campaigns === 1 ? "it" : "them"} — mid-story. Everything already
            narrated stays exactly as it was.
          </Alert>
        </div>
      ) : null}

      {storyline.scope === "COMMUNITY" ? (
        <div className="mb-6">
          <Alert tone="info">
            This one is shared with every family on this server. It is still yours to edit — but
            other people&rsquo;s children may be part-way through it, so the warning above applies
            to families you have never met.
          </Alert>
        </div>
      ) : null}

      <Card>
        <StorylineForm
          surface="household"
          initial={{
            id: storyline.id,
            title: storyline.title,
            tagline: storyline.tagline,
            premise: storyline.premise,
            hook: storyline.hook,
            defaultTone: storyline.defaultTone,
            readingLevel: storyline.readingLevel,
            minPlayers: storyline.minPlayers,
            maxPlayers: storyline.maxPlayers,
            estimatedScenes: storyline.estimatedScenes,
            pressureName: storyline.pressureName,
            isActive: storyline.isActive,
            acts: storyline.acts.map((act) => ({
              title: act.title,
              goal: act.goal,
              beats: act.beats.join("\n"),
              seeks: act.seeks.join("\n"),
            })),
          }}
        />
      </Card>
    </main>
  );
}
