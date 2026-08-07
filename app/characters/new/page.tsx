import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { BLANK_CHARACTER, CharacterForm } from "@/components/character/character-form";

export const dynamic = "force-dynamic";

export default async function NewCharacterPage() {
  await requireUser();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="New adventurer"
        title="Who is coming along?"
        lead="Nothing here is permanent — everything can be changed later, and none of it can be got wrong."
      />
      <Card>
        <CharacterForm initial={BLANK_CHARACTER} mode="create" />
      </Card>
    </main>
  );
}
