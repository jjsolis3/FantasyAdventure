import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { deleteCharacterAction } from "@/lib/game/actions";
import { Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CharacterForm } from "@/components/character/character-form";
import { RelationshipEditor, type RelationRow } from "@/components/character/relationship-editor";
import { kindFromPerspective } from "@/lib/game/rules";

export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // Scoped by userId, so a guessed id from another household 404s rather than
  // leaking that the character exists.
  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    include: {
      skills: { orderBy: { name: "asc" } },
      inventory: { orderBy: { name: "asc" } },
      relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
      relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
    },
  });
  if (!character) notFound();

  const others = await db.character.findMany({
    where: { userId: user.id, id: { not: character.id } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const relations: RelationRow[] = [
    ...character.relationshipsA.map((row) => ({
      id: row.id,
      otherId: row.characterB.id,
      otherName: row.characterB.name,
      kind: kindFromPerspective(row, character.id),
      bondXp: row.bondXp,
    })),
    ...character.relationshipsB.map((row) => ({
      id: row.id,
      otherId: row.characterA.id,
      otherName: row.characterA.name,
      kind: kindFromPerspective(row, character.id),
      bondXp: row.bondXp,
    })),
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow={`Level ${character.level}`}
        title={character.name}
        lead={`${character.race} ${character.archetype} · ${character.pronouns}`}
      />

      <div className="mb-6">
        <Link href="/characters" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← All adventurers
        </Link>
      </div>

      <div className="space-y-6">
        {character.skills.length > 0 || character.inventory.length > 0 ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">What they can do</h2>

            {character.skills.length > 0 ? (
              <ul className="space-y-1">
                {character.skills.map((skill) => (
                  <li key={skill.id} className="text-sm text-hearth-200/80">
                    {skill.name}
                    <span className="ml-2 text-hearth-400">rank {skill.rank}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {character.inventory.length > 0 ? (
              <>
                <h3 className="mt-5 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                  Carrying
                </h3>
                <ul className="space-y-1">
                  {character.inventory.map((item) => (
                    <li key={item.id} className="text-sm text-hearth-200/80">
                      {item.name}
                      {item.quantity > 1 ? <span className="text-hearth-400"> ×{item.quantity}</span> : null}
                      {item.description ? (
                        <span className="text-hearth-400"> — {item.description}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <h2 className="font-display mb-5 text-xl text-hearth-100">Family ties</h2>
          <RelationshipEditor
            characterId={character.id}
            characterName={character.name}
            relations={relations}
            others={others}
          />
        </Card>

        <Card>
          <h2 className="font-display mb-5 text-xl text-hearth-100">Edit</h2>
          <CharacterForm
            mode="edit"
            initial={{
              id: character.id,
              name: character.name,
              race: character.race,
              archetype: character.archetype,
              gender: character.gender ?? "",
              pronouns: character.pronouns,
              ageBand: character.ageBand,
              description: character.description ?? "",
              stats: {
                might: character.might,
                wits: character.wits,
                heart: character.heart,
                spark: character.spark,
              },
              skills: character.skills.map((skill) => skill.name),
            }}
          />
        </Card>

        <Card className="border-red-900/40">
          <h2 className="font-display mb-2 text-xl text-hearth-100">Remove</h2>
          <p className="mb-4 text-sm text-hearth-400">
            Deletes {character.name} and their family ties. This cannot be undone.
          </p>
          <form action={deleteCharacterAction}>
            <input type="hidden" name="characterId" value={character.id} />
            <SubmitButton variant="danger" pendingLabel="Removing…">
              Remove {character.name}
            </SubmitButton>
          </form>
        </Card>
      </div>
    </main>
  );
}
