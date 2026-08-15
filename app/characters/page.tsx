import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import {
  RELATIONSHIP_LABELS,
  STATS,
  STAT_INFO,
  kindFromPerspective,
  statsOf,
} from "@/lib/game/rules";
import { AGE_BANDS } from "@/lib/game/character-options";
import { LevelBadge } from "@/components/character/level-badge";
import { waitingPointsFor } from "@/lib/game/waiting-points";
import { CONFIRMED_TIES } from "@/lib/game/ties";

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
      knacks: { select: { id: true } },
      relationshipsA: {
        where: CONFIRMED_TIES,
        include: { characterB: { select: { id: true, name: true } } },
      },
      relationshipsB: {
        where: CONFIRMED_TIES,
        include: { characterA: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Where each adventurer is wanted, so this list can say so.
  //
  // The two things worth interrupting somebody for are a turn nobody has
  // answered and a point of growth nobody has spent. Both were previously
  // invisible from here — a girl could be owed a level-up for three weeks and
  // the only way to find out was to open her sheet and notice.
  const waiting = await waitingPointsFor(
    characters.map((character) => ({
      id: character.id,
      userId: character.userId,
      xp: character.xp,
      stats: statsOf(character),
      buildBudget: character.buildBudget,
      knackCount: character.knacks.length,
      chosenSkillCount: character.skills.filter((skill) => skill.chosenAtLevel !== null).length,
      level: character.level,
    })),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your household"
        title="Adventurers"
        lead="Everyone who might come along. Build the whole family — you choose who travels when an adventure begins."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/characters/new"
          className="inline-block rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
        >
          Add an adventurer
        </Link>
        <Link
          href="/characters/claim"
          className="inline-block rounded-lg border border-hearth-700 px-4 py-2 font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
        >
          Take one on
        </Link>
      </div>

      {characters.length === 0 ? (
        <Card>
          <p className="text-hearth-200/70">
            No adventurers yet. Start with one — you can add the rest of the family afterwards and
            tell the game how they are related. If somebody has already built yours, ask them for a
            handover code and <Link href="/characters/claim" className="text-hearth-300 underline hover:text-hearth-200">take them on</Link>{" "}
            instead, so nothing they have earned is lost.
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

            const points = waiting.get(character.id) ?? [];

            return (
              <li key={character.id}>
                <Card className="transition-colors hover:border-hearth-700">
                  {points.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {points.map((point) => (
                        <Link
                          key={point.label}
                          href={point.href}
                          className="rounded-full border border-amber-700/50 bg-amber-950/30 px-3 py-1 text-xs font-medium text-amber-200 hover:border-amber-600"
                        >
                          {point.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {/* The badge sits in its own column so a long name wraps
                      beside it rather than pushing it off the card. */}
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
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
                        <Link
                          href={`/characters/${character.id}/story`}
                          className="text-sm text-hearth-400 underline underline-offset-4 hover:text-hearth-200"
                        >
                          the long road
                        </Link>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3">
                        {STATS.map((stat) => (
                          <span key={stat} className="text-sm text-hearth-300">
                            <span className="text-hearth-400">{STAT_INFO[stat].label}</span>{" "}
                            {character[stat]}
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
                    </div>

                    <LevelBadge xp={character.xp} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
