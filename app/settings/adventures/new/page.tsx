import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { StorylineForm } from "@/components/settings/storyline-form";

export const dynamic = "force-dynamic";

export default async function NewAdventurePage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Settings · Adventures"
        title="Write an adventure"
        lead="You are writing the spine, not the story. The storyteller improvises everything that actually happens — what you write here is what it holds on to while it does."
      />

      <div className="mb-6">
        <Link href="/settings/adventures" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← All adventures
        </Link>
      </div>

      <Card>
        <StorylineForm
          initial={{
            title: "",
            tagline: "",
            premise: "",
            hook: "",
            defaultTone: "COZY",
            readingLevel: "FAMILY_MIXED",
            minPlayers: 2,
            maxPlayers: 5,
            estimatedScenes: 12,
            pressureName: "The clock",
            // Off until it is finished. Nothing half-written should appear in
            // the list a family picks from on a Friday evening.
            isActive: false,
            acts: [],
          }}
        />
      </Card>
    </main>
  );
}
