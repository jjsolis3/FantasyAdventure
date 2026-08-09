import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Alert, Card, PageTitle } from "@/components/ui";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

/**
 * Bringing one of your adventurers into somebody else's adventure.
 *
 * The code may arrive typed out or as a link, so it is accepted both ways: a
 * `?code=` in the address fills the box in, and the box is still there for
 * whoever was told the code across the room.
 */
export default async function JoinCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await requireUser();
  const { code } = await searchParams;

  const characters = await db.character.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, race: true, archetype: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="Join a table"
        title="Come along on somebody else's adventure"
        lead="Whoever set it up can show you a code. Bring one adventurer, and you will see the same story they do."
      />

      <div className="mb-6">
        <Link href="/campaigns" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← Your adventures
        </Link>
      </div>

      <Card>
        {characters.length === 0 ? (
          <Alert tone="info">
            You need somebody to send first.{" "}
            <Link href="/characters/new" className="underline hover:text-hearth-100">
              Build an adventurer
            </Link>
            , then come back with the code.
          </Alert>
        ) : (
          <JoinForm characters={characters} initialCode={code ?? ""} />
        )}
      </Card>
    </main>
  );
}
