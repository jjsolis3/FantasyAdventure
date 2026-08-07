import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { STATS, STAT_INFO, kindFromPerspective, RELATIONSHIP_LABELS } from "@/lib/game/rules";
import { AGE_BANDS } from "@/lib/game/character-options";

export const dynamic = "force-dynamic";

function ageLabel(value: string) {
  return AGE_BANDS.find((band) => band.value === value)?.label ?? value;
}

export default async function CharactersPage() {
  const user = await requireUser();

  const characters = await db.character.findMany({
    where: { userId: user.id },
    include: {
      skills: true,
      relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
      relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your household"
        title="Adventurers"
        lead="Everyone who might come along. Build the whole family — you choose who travels when an adventure begins."
      />

      <div className="mb-6">
        <Link
          href="/characters/new"
          className="inline-block rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
        >
          Add an adventurer
        </Link>
      </div>

      {characters.length === 0 ? (
        <Card>
          <p className="text-hearth-200/70">
            No adventurers yet. Start with one — you can add the rest of the family afterwards and
            tell the game how they are related.
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {characters.map((character) => {
            const relations = [
              ...character.relationshipsA.map((row) => ({
                id: row.id,
                other: row.characterB,
                kind: kindFromPerspective(row, character.id),
                bondLevel: row.bondLevel,
              })),
              ...character.relationshipsB.map((row) => ({
                id: row.id,
                other: row.characterA,
                kind: kindFromPerspective(row, character.id),
                bondLevel: row.bondLevel,
              })),
            ];

            return (
              <li key={character.id}>
                <Card className="transition-colors hover:border-hearth-700">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link
                      href={`/characters/${character.id}`}
                      className="font-display text-xl text-hearth-100 hover:text-hearth-50"
                    >
                      {character.name}
                    </Link>
                    <span className="text-sm text-hearth-300">
                      {ageLabel(character.ageBand)} {character.race} {character.archetype}
                    </span>
                    <span className="text-xs text-hearth-400">{character.pronouns}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3">
                    {STATS.map((stat) => (
                      <span key={stat} className="text-sm text-hearth-300">
                        <span className="text-hearth-400">{STAT_INFO[stat].label}</span> {character[stat]}
                      </span>
                    ))}
                  </div>

                  {character.skills.length > 0 ? (
                    <p className="mt-3 text-sm text-hearth-200/60">
                      {character.skills.map((skill) => skill.name).join(" · ")}
                    </p>
                  ) : null}

                  {relations.length > 0 ? (
                    <p className="mt-3 text-sm text-hearth-400">
                      {relations
                        .map((relation) => `${RELATIONSHIP_LABELS[relation.kind]} ${relation.other.name}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
