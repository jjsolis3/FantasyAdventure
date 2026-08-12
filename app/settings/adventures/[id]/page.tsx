import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { Alert, Card, PageTitle } from "@/components/ui";
import { ChapterArt } from "@/components/settings/chapter-art";
import { shippedChapterArt } from "@/lib/game/scene-picture";
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

  // Keyed by slug and act number rather than act id: the seed deletes and
  // recreates every act row on container start, so anything hung off an id
  // would vanish on the next redeploy.
  const chapterVersions = new Map(
    (
      await db.chapterImage.findMany({
        where: { storylineSlug: storyline.slug },
        select: { actIndex: true, version: true },
      })
    ).map((row) => [row.actIndex, row.version]),
  );

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

      <Card className="mb-6">
        <h2 className="font-display mb-1 text-xl text-hearth-100">Chapter pictures</h2>
        <p className="mb-4 text-sm text-hearth-400">
          A picture here is used by every family who plays this adventure, and it means the
          storyteller never has to draw one — no waiting, no drawing service, no cost.{" "}
          <span className="text-hearth-300">npm run art:prompts</span> writes a ready-made prompt
          for each chapter below. A family can still draw their own on top, from the adventure&rsquo;s
          own picture page.
        </p>
        <ChapterArt
          slug={storyline.slug}
          chapters={storyline.acts.map((act) => ({
            actIndex: act.index,
            title: act.title,
            version: chapterVersions.get(act.index) ?? null,
            shippedUrl: shippedChapterArt(storyline.slug, act.index),
          }))}
        />
      </Card>

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
