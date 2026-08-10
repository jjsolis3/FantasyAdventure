import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { Alert, Card, PageTitle } from "@/components/ui";
import { StorylineForm } from "@/components/settings/storyline-form";

export const dynamic = "force-dynamic";

export default async function EditAdventurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();

  const storyline = await db.storyline.findUnique({
    where: { id },
    include: {
      acts: { orderBy: { index: "asc" } },
      _count: { select: { campaigns: true } },
    },
  });
  if (!storyline) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Settings · Adventures"
        title={storyline.title}
        lead={storyline.tagline}
      />

      <div className="mb-6">
        <Link href="/settings/adventures" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← All adventures
        </Link>
      </div>

      {storyline.isCustom ? null : (
        <div className="mb-6">
          <Alert tone="info">
            This adventure came with the game, and is rewritten from the source on every
            deployment. Saving it here makes it yours: your version wins from then on, and later
            improvements to the original will not reach it. To try something without that, go back
            and <strong>make a copy</strong> instead.
          </Alert>
        </div>
      )}

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

      <Card>
        <StorylineForm
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
