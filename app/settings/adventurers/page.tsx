import Link from "next/link";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Everyone in this family, and what they have earned.
 *
 * It used to look across every household in the installation, which was the
 * reason it was administrator-only. Now it looks at one — the caller's — and is
 * open to whoever answers for that family. A platform administrator still sees
 * all of them, because somebody has to be able to help a family who cannot help
 * themselves.
 *
 * A list rather than a set of controls. Starting somebody again is a page of
 * its own, behind a name typed out in full — see `[id]/page.tsx`.
 */
export default async function AdventurersPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; who?: string }>;
}) {
  const actor = await requireHouseholdParent();
  const { done, who } = await searchParams;

  const characters = await db.character.findMany({
    // Scoped to the caller's own family. This query had no `where` at all —
    // which was defensible while only an administrator could reach the page and
    // there was only one family, and is a leak between customers the moment a
    // second family's parent can open it.
    //
    // A platform administrator still sees everything: somebody has to be able
    // to help a family who cannot help themselves.
    where: actor.everywhere ? {} : { householdId: actor.householdId ?? "" },
    orderBy: [{ household: { name: "asc" } }, { user: { displayName: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      race: true,
      archetype: true,
      level: true,
      xp: true,
      user: { select: { displayName: true } },
      household: { select: { id: true, name: true } },
      _count: { select: { skills: true, knacks: true, keepsakes: true } },
      partyMemberships: {
        where: { campaign: { status: "ACTIVE" } },
        select: { campaign: { select: { title: true } } },
      },
    },
  });

  // Grouped by household — genuinely, now. This keyed on the account's display
  // name and called the result "households", which was the closest thing
  // available before there was a table to ask. Two accounts in one family came
  // out as two households, which is exactly the confusion all of this fixes.
  const households = new Map<string, typeof characters>();
  for (const character of characters) {
    const key = character.household.name;
    households.set(key, [...(households.get(key) ?? []), character]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={actor.everywhere ? "Every household" : "Your household"}
        title="Adventurers"
        lead="Everyone in the family, and what they have earned so far."
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
            Nobody in this family has built an adventurer yet. They appear here as soon as somebody does.
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
