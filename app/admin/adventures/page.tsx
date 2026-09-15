import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { duplicateStorylineAction, setStorylineActiveAction } from "@/lib/game/storyline-actions";
import { Alert, Card, PageTitle } from "@/components/ui";
import { READING_LEVEL_LABELS, TONE_LABELS } from "@/components/campaign/options";
import { StorylineScopeForm } from "./scope-form";

export const dynamic = "force-dynamic";

export default async function AdventuresPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePlatformAdmin();
  const { saved } = await searchParams;

  // Everything, including what families have written — this is the screen
  // where somebody decides whether one of those should be offered to everybody.
  const [storylines, households] = await Promise.all([
    db.storyline.findMany({
      include: {
        _count: { select: { acts: true, campaigns: true } },
        household: { select: { name: true } },
      },
      orderBy: [{ scope: "asc" }, { isCustom: "desc" }, { title: "asc" }],
    }),
    db.household.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Settings"
        title="Adventures"
        lead="The library a family chooses from. Ten came with the game; anything you write here is yours and survives every deployment."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/admin"
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          ← Administration
        </Link>
        <div className="flex-1" />
        <Link
          href="/admin/adventures/new"
          className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
        >
          Write a new one
        </Link>
      </div>

      {saved ? (
        <div className="mb-6">
          <Alert tone="success">Saved.</Alert>
        </div>
      ) : null}

      <div className="space-y-4">
        {storylines.map((storyline) => (
          <Card key={storyline.id}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link
                href={`/admin/adventures/${storyline.id}`}
                className="font-display text-xl text-hearth-100 hover:text-hearth-50"
              >
                {storyline.title}
              </Link>
              {storyline.isCustom ? (
                <span className="rounded-full border border-moss-700/50 bg-moss-900/20 px-2.5 py-0.5 text-xs text-moss-400">
                  yours
                </span>
              ) : null}
              {storyline.isActive ? null : (
                <span className="rounded-full border border-hearth-700/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-400">
                  not offered
                </span>
              )}
              {/* Whose it is, said out loud. Without this the list reads as one
                  library, which is exactly the assumption that made every
                  family's adventure visible to every other family. */}
              {storyline.scope === "SYSTEM" ? null : (
                <span className="rounded-full border border-hearth-600/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-300">
                  {storyline.scope === "COMMUNITY"
                    ? `shared · ${storyline.household?.name ?? "nobody"}`
                    : (storyline.household?.name ?? "nobody's")}
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-hearth-200/70 italic">{storyline.tagline}</p>

            <p className="mt-2 text-sm text-hearth-400">
              {TONE_LABELS[storyline.defaultTone] ?? storyline.defaultTone} ·{" "}
              {READING_LEVEL_LABELS[storyline.readingLevel] ?? storyline.readingLevel} ·{" "}
              {storyline.minPlayers}–{storyline.maxPlayers} adventurers · {storyline._count.acts}{" "}
              {storyline._count.acts === 1 ? "chapter" : "chapters"}
              {storyline._count.campaigns > 0
                ? ` · played ${storyline._count.campaigns} ${
                    storyline._count.campaigns === 1 ? "time" : "times"
                  }`
                : ""}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/admin/adventures/${storyline.id}`}
                className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50"
              >
                {storyline.isCustom ? "Edit" : "Edit (makes it yours)"}
              </Link>

              <form action={duplicateStorylineAction}>
                <input type="hidden" name="storylineId" value={storyline.id} />
                <input type="hidden" name="surface" value="admin" />
                <button
                  type="submit"
                  aria-label={`Make a copy of ${storyline.title}`}
                  className="rounded-lg border border-hearth-700 px-4 py-2 text-sm font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
                >
                  Make a copy
                </button>
              </form>

              <form action={setStorylineActiveAction}>
                <input type="hidden" name="storylineId" value={storyline.id} />
                <input type="hidden" name="active" value={storyline.isActive ? "false" : "true"} />
                {/* Labelled with the adventure it acts on: every row has the
                    same three buttons, so "which one?" must be answerable
                    without counting rows. */}
                <button
                  type="submit"
                  aria-label={`${storyline.isActive ? "Stop offering" : "Offer"} ${storyline.title}`}
                  className="rounded-lg border border-hearth-700 px-4 py-2 text-sm font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
                >
                  {storyline.isActive ? "Stop offering it" : "Offer it"}
                </button>
              </form>
            </div>

            {/* The only place a family's adventure becomes everybody's. Kept
                below the buttons rather than beside them because it is the one
                control here that changes who can *see* something, and those
                should never be a misclick away from the ones that do not. */}
            <div className="mt-4 border-t border-hearth-800/50 pt-3">
              <StorylineScopeForm
                storylineId={storyline.id}
                title={storyline.title}
                scope={storyline.scope}
                tier={storyline.tier}
                householdId={storyline.householdId}
                households={households}
              />
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <h2 className="font-display mb-2 text-lg text-hearth-100">A note on editing the ones that came with it</h2>
        <p className="text-sm text-hearth-200/70">
          The shipped adventures are rewritten from the source on every deployment, which is how
          they get improved. Editing one here marks it as yours and stops that happening — your
          version wins from then on, and later improvements to the original will not reach it. If
          you only want to try something, <strong>make a copy</strong> and edit that instead.
        </p>
        <p className="mt-3 text-sm text-hearth-200/70">
          Nothing is ever deleted. An adventure somebody is part-way through needs its premise and
          its chapters to keep existing, so the most you can do is stop offering it to new games.
        </p>
      </Card>
    </main>
  );
}
