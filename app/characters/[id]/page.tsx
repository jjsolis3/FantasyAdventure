import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { CharacterForm } from "@/components/character/character-form";
import { DeleteCharacter } from "@/components/character/delete-character";
import { PortraitUpload } from "@/components/character/portrait-upload";
import { Handover } from "@/components/character/handover";
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
      // Only so that removing them can say which stories they would leave.
      partyMemberships: {
        include: { campaign: { select: { id: true, title: true, status: true } } },
      },
      portrait: { select: { version: true } },
      keepsakes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!character) notFound();

  // Your own adventurers, and anyone this one has actually travelled with.
  // The second half matters once a household hands each child their own
  // sign-in: "Wren is Mira's daughter" is then a tie between two accounts, and
  // the action has always allowed it — this is the list catching up.
  const others = await db.character.findMany({
    where: {
      id: { not: character.id },
      OR: [
        { userId: user.id },
        {
          partyMemberships: {
            some: { campaign: { party: { some: { characterId: character.id } } } },
          },
        },
      ],
    },
    select: { id: true, name: true, userId: true, user: { select: { displayName: true } } },
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
        {character.skills.length > 0 ||
        character.inventory.length > 0 ||
        character.keepsakes.length > 0 ? (
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

            {character.keepsakes.length > 0 ? (
              <>
                <h3 className="mt-5 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                  Given up
                </h3>
                <ul className="space-y-1">
                  {character.keepsakes.map((keepsake) => (
                    <li key={keepsake.id} className="text-sm text-hearth-200/80">
                      {keepsake.name}
                      <span className="text-hearth-400"> — {keepsake.note}</span>
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
            others={others.map((other) => ({
              id: other.id,
              name: other.name,
              playedBy: other.userId === user.id ? null : other.user.displayName,
            }))}
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

        <Card>
          <h2 className="font-display mb-3 text-xl text-hearth-100">Portrait</h2>
          <PortraitUpload
            characterId={character.id}
            characterName={character.name}
            version={character.portrait?.version ?? null}
          />
        </Card>

        <Card>
          <h2 id="hand-over" className="font-display mb-3 scroll-mt-6 text-xl text-hearth-100">
            Hand over
          </h2>
          <Handover
            characterId={character.id}
            characterName={character.name}
            code={character.handoverCode}
          />
        </Card>

        <Card className="border-red-900/40">
          <h2 className="font-display mb-2 text-xl text-hearth-100">Remove</h2>
          <DeleteCharacter
            characterId={character.id}
            characterName={character.name}
            loss={{
              level: character.level,
              xp: character.xp,
              skills: character.skills.length,
              items: character.inventory.length,
              ties: relations.length,
              adventures: character.partyMemberships.map((member) => ({
                id: member.campaign.id,
                title: member.campaign.title,
                finished: member.campaign.status === "COMPLETE",
              })),
            }}
          />
        </Card>
      </div>
    </main>
  );
}
