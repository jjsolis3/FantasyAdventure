import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";

/**
 * Taking on an adventurer somebody else built.
 *
 * The path a family actually takes: one adult builds everybody at the kitchen
 * table, and later each child gets their own sign-in. Without this they would
 * have to build their own character again, at level 1, with none of what they
 * earned — which is a good enough reason not to bother having their own sign-in
 * at all.
 */
export default async function ClaimCharacterPage() {
  await requireUser();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="Adventurers"
        title="Take one on"
        lead="If somebody else built your adventurer, they can hand them over. Nothing is lost in the move — you get them exactly as they are."
      />

      <div className="mb-6">
        <Link href="/characters" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← Your adventurers
        </Link>
      </div>

      <Card>
        <ClaimForm />
      </Card>
    </main>
  );
}
