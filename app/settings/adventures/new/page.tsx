import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHouseholdParent } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { StorylineForm } from "@/components/settings/storyline-form";

export const dynamic = "force-dynamic";

export default async function NewFamilyAdventurePage() {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) redirect("/settings");

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your household"
        title="Write an adventure"
        lead="You are writing the spine, not the story. The storyteller improvises everything that actually happens — what you write here is what it holds on to while it does."
      />

      <div className="mb-6">
        <Link
          href="/settings/adventures"
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          ← Your adventures
        </Link>
      </div>

      <Card>
        <StorylineForm
          surface="household"
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
