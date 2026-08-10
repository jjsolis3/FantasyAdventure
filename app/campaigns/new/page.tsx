import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { CampaignSetup } from "@/components/campaign/campaign-setup";
import { invitableCharacters } from "@/lib/game/invites";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const sessionUser = await requireUser();

  const [user, storylines, characters, invitable] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: sessionUser.id } }),
    db.storyline.findMany({
      where: { isActive: true },
      include: { _count: { select: { acts: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.character.findMany({
      where: { userId: sessionUser.id },
      select: { id: true, name: true, race: true, archetype: true, ageBand: true },
      orderBy: { createdAt: "asc" },
    }),
    invitableCharacters(sessionUser.id),
  ]);

  // Nothing to set up without a party; send people to build one instead.
  if (characters.length === 0) redirect("/characters/new");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="New adventure"
        title="Set the table"
        lead="Pick a story, choose who is coming, and decide how it should be told."
      />
      <Card>
        <CampaignSetup
          storylines={storylines.map((storyline) => ({
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
            actCount: storyline._count.acts,
          }))}
          characters={characters}
          invitable={invitable}
          defaultReadingLevel={user.defaultReadingLevel}
        />
      </Card>
    </main>
  );
}
