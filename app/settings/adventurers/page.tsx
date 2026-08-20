import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Everyone in the house, and what they have earned.
 *
 * The only page in the application that looks across households. That is the
 * whole reason it is administrator-only: everywhere else, an adventurer belongs
 * to the account that built her and nobody else can see her sheet.
 *
 * A list rather than a set of controls. Starting somebody again is a page of
 * its own, behind a name typed out in full — see `[id]/page.tsx`.
 */
export default async function AdventurersPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; who?: string }>;
}) {
  await requireAdmin();
  const { done, who } = await searchParams;

  const characters = await db.character.findMany({
    orderBy: [{ user: { displayName: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      race: true,
      archetype: true,
      level: true,
      xp: true,
      user: { select: { displayName: true } },
      _count: { select: { skills: true, knacks: true, keepsakes: true } },
      partyMemberships: {
        where: { campaign: { status: "ACTIVE" } },
        select: { campaign: { select: { title: true } } },
      },
    },
  });

  // Grouped by household, because "whose is this?" is the first question asked
  // of a list that spans every account in the house.
  const households = new Map<string, typeof characters>();
  for (const character of characters) {
    const key = character.user.displayName;
    households.set(key, [...(households.get(key) ?? []), character]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Administrator"
        title="Adventurers"
        lead="Everyone in the house, and what they have earned so far."
      />

      {/* Said out loud, because the alternative is what this used to do: finish
          a destructive action by returning to a page that looks exactly like
          one where nothing happened. */}
      {done === "again" || done === "relaid" ? (
        <div
          role="status"
          className={`mb-8 rounded-xl border px-4 py-3 text-sm ${
            done === "again"
              ? "border-rose-800/50 bg-rose-950/25 text-rose-100"
              : "border-moss-800/50 bg-moss-900/15 text-moss-100"
          }`}
        >
          {done === "again"
            ? `${who ?? "That adventurer"} has been started again — level 1, and nothing earned since the day they were built.`
            : `${who ?? "That adventurer"}'s numbers have been re-laid. Nothing else changed, and any points their experience has earned are theirs to spend again.`}
        </div>
      ) : null}

      <p className="mb-8">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      {characters.length === 0 ? (
        <Card>
          <p className="text-hearth-300">
            Nobody has built an adventurer yet. They appear here as soon as somebody does.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {[...households.entries()].map(([household, members]) => (
            <section key={household}>
              <h2 className="font-display mb-3 text-lg text-hearth-300">{household}</h2>

              <ul className="space-y-3">
                {members.map((character) => {
                  // What a reset would actually be undoing. Shown on the list so
                  // the person deciding can see at a glance which sheets have
                  // something on them and which are still blank.
                  const earned = [
                    character.level > 1 ? `level ${character.level}` : null,
                    character.xp > 0 ? `${character.xp} xp` : null,
                    character._count.skills > 0
                      ? `${character._count.skills} ${character._count.skills === 1 ? "skill" : "skills"}`
                      : null,
                    character._count.knacks > 0 ? `${character._count.knacks} knacks` : null,
                    character._count.keepsakes > 0 ? `${character._count.keepsakes} keepsakes` : null,
                  ].filter(Boolean);

                  return (
                    <li key={character.id}>
                      <Link href={`/settings/adventurers/${character.id}`} className="block">
                        <Card className="transition-colors hover:border-hearth-700">
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <h3 className="font-display text-lg text-hearth-100">{character.name}</h3>
                            <span className="text-sm text-hearth-500">
                              {character.race} {character.archetype}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-hearth-300/80">
                            {earned.length > 0 ? earned.join(" · ") : "Nothing earned yet"}
                          </p>

                          {character.partyMemberships.length > 0 ? (
                            <p className="mt-2 text-sm text-amber-300/80">
                              In {character.partyMemberships.map((m) => m.campaign.title).join(", ")}
                              , still going
                            </p>
                          ) : null}
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
