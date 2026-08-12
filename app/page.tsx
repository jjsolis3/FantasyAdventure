import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { Alert, Card, PageTitle } from "@/components/ui";
import { READING_LEVEL_LABELS, TONE_LABELS } from "@/components/campaign/options";
import { WhereYouLeftOff } from "@/components/home/where-you-left-off";
import { whereYouLeftOff } from "@/lib/game/where-you-left-off";

export const dynamic = "force-dynamic";

// The labels come from `components/campaign/options`, which is where the tones
// and reading levels are actually defined. This page used to keep its own copy,
// and it was one tone out of date: SPOOKY was added to the game and never here,
// so three of the ten adventures introduced themselves as "SPOOKY" in capitals.

async function loadStorylines() {
  try {
    const storylines = await db.storyline.findMany({
      where: { isActive: true },
      include: { acts: { orderBy: { index: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return { storylines, error: null as string | null };
  } catch (error) {
    return { storylines: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function Home() {
  const user = await getCurrentUser().catch(() => null);
  const { storylines, error } = await loadStorylines();

  // Only asked once there is somebody to ask about. Signed out, this page is a
  // brochure and should not touch the campaign tables at all.
  const inProgress = user ? await whereYouLeftOff(user.id).catch(() => []) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={user ? `Welcome back, ${user.displayName}` : "A family adventure"}
        title="Hearthlight"
        lead="A wholesome fantasy adventure for the whole family, guided by a Game Master who never gets tired and never says no to a silly idea."
      />

      {error ? (
        <Card className="border-red-900/50 bg-red-950/30">
          <h2 className="font-display text-xl text-red-200">The database is not reachable yet</h2>
          <p className="mt-2 text-sm text-red-200/70">
            The app is running, but it could not read the storylines. Check that{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">DATABASE_URL</code> is set and that
            migrations have run.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-red-200/60">{error}</pre>
        </Card>
      ) : (
        <>
          <WhereYouLeftOff adventures={inProgress} />

          {user ? (
            <div className="mb-8">
              <Alert tone="info">
                Ready when you are —{" "}
                <Link href="/campaigns/new" className="underline hover:text-hearth-100">
                  start an adventure
                </Link>{" "}
                or{" "}
                <Link href="/characters" className="underline hover:text-hearth-100">
                  build your family
                </Link>
                .
              </Alert>
            </div>
          ) : (
            <div className="mb-8">
              <Alert tone="info">
                <Link href="/login" className="underline hover:text-hearth-100">
                  Sign in
                </Link>{" "}
                to build your party and begin an adventure.
              </Alert>
            </div>
          )}

          <section>
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="font-display text-2xl text-hearth-100">
                {inProgress.length > 0 ? "Other adventures" : "Adventures waiting"}
              </h2>
              <span className="text-sm text-hearth-400">{storylines.length} available</span>
            </div>

            <ul className="space-y-4">
              {storylines.map((storyline) => (
                <li key={storyline.id}>
                  <Card className="transition-colors hover:border-hearth-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl text-hearth-100">{storyline.title}</h3>
                      <span className="rounded-full border border-moss-600/50 bg-moss-800/40 px-2.5 py-0.5 text-xs text-moss-400">
                        {TONE_LABELS[storyline.defaultTone] ?? storyline.defaultTone}
                      </span>
                      <span className="rounded-full border border-hearth-700/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-300">
                        {READING_LEVEL_LABELS[storyline.readingLevel] ?? storyline.readingLevel}
                      </span>
                    </div>

                    <p className="mt-2 text-hearth-200/70 italic">{storyline.tagline}</p>
                    <p className="mt-3 text-sm leading-relaxed text-hearth-200/60">{storyline.premise}</p>
                    <p className="mt-4 text-xs text-hearth-400">
                      {storyline.minPlayers}–{storyline.maxPlayers} adventurers · {storyline.acts.length} acts · ~
                      {storyline.estimatedScenes} scenes
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <footer className="mt-16 border-t border-hearth-800/50 pt-6 text-sm text-hearth-400">
        <a href="/api/health" className="text-hearth-300 underline hover:text-hearth-200">
          Health check
        </a>
      </footer>
    </main>
  );
}
