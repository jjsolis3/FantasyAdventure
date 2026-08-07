import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const READING_LEVEL_LABELS: Record<string, string> = {
  EARLY_READER: "Early reader",
  MIDDLE_GRADE: "Middle grade",
  TEEN: "Teen",
  FAMILY_MIXED: "Mixed ages",
};

const TONE_LABELS: Record<string, string> = {
  COZY: "Cozy",
  ADVENTUROUS: "Adventurous",
};

async function loadStorylines() {
  try {
    const storylines = await db.storyline.findMany({
      where: { isActive: true },
      include: { acts: { orderBy: { index: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return { storylines, error: null as string | null };
  } catch (error) {
    return {
      storylines: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function Home() {
  const { storylines, error } = await loadStorylines();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <header className="mb-14">
        <p className="mb-3 text-sm font-medium tracking-[0.2em] text-hearth-400 uppercase">
          Milestone 0 · Foundations
        </p>
        <h1 className="font-display text-5xl font-semibold text-hearth-100 sm:text-6xl">
          Hearthlight
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-hearth-200/80">
          A wholesome fantasy adventure for the whole family, guided by a Game
          Master who never gets tired and never says no to a silly idea.
        </p>
      </header>

      {error ? (
        <section className="rounded-xl border border-red-900/50 bg-red-950/30 p-6">
          <h2 className="font-display text-xl text-red-200">
            The database is not reachable yet
          </h2>
          <p className="mt-2 text-sm text-red-200/70">
            The app is running, but it could not read the storylines. Check that{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">DATABASE_URL</code> is set
            and that migrations have run.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-red-200/60">
            {error}
          </pre>
        </section>
      ) : (
        <section>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-hearth-100">
              Adventures waiting
            </h2>
            <span className="text-sm text-hearth-400">
              {storylines.length} seeded
            </span>
          </div>

          <ul className="space-y-4">
            {storylines.map((storyline) => (
              <li
                key={storyline.id}
                className="rounded-xl border border-hearth-800/60 bg-hearth-900/40 p-6 transition-colors hover:border-hearth-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl text-hearth-100">
                    {storyline.title}
                  </h3>
                  <span className="rounded-full border border-moss-600/50 bg-moss-800/40 px-2.5 py-0.5 text-xs text-moss-400">
                    {TONE_LABELS[storyline.defaultTone] ?? storyline.defaultTone}
                  </span>
                  <span className="rounded-full border border-hearth-700/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-300">
                    {READING_LEVEL_LABELS[storyline.readingLevel] ?? storyline.readingLevel}
                  </span>
                </div>

                <p className="mt-2 text-hearth-200/70 italic">{storyline.tagline}</p>

                <p className="mt-3 text-sm leading-relaxed text-hearth-200/60">
                  {storyline.premise}
                </p>

                <p className="mt-4 text-xs text-hearth-400">
                  {storyline.minPlayers}–{storyline.maxPlayers} adventurers ·{" "}
                  {storyline.acts.length} acts · ~{storyline.estimatedScenes} scenes
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-16 border-t border-hearth-800/50 pt-6 text-sm text-hearth-400">
        Next up: accounts and invite codes, then the character builder.{" "}
        <a href="/api/health" className="text-hearth-300 underline hover:text-hearth-200">
          Health check
        </a>
      </footer>
    </main>
  );
}
