import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { previewReset, suggestedBuild } from "@/lib/game/reset";
import { ResetAdventurer } from "@/components/settings/reset-adventurer";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Starting one adventurer again.
 *
 * A page rather than a button on a list, and it spends most of its height
 * saying what will happen before it offers to do it. What a reset undoes took
 * evenings to earn; the least it deserves is to be legible first.
 *
 * The counts are real, read from her sheet, rather than a generic warning. "3
 * skills, 1 knack, 4 keepsakes" is a thing somebody can weigh. "This cannot be
 * undone" is not.
 */
export default async function ResetAdventurerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const preview = await previewReset(id);
  if (!preview) notFound();

  const goes = [
    preview.level > 1 ? `her level — back to 1 from ${preview.level}` : null,
    preview.xp > 0 ? `${preview.xp} experience` : null,
    preview.skills > 0
      ? `${preview.skills} ${preview.skills === 1 ? "skill" : "skills"} she has learned`
      : null,
    preview.practices > 0 ? `what she has been practising` : null,
    preview.knacks > 0 ? `${preview.knacks} ${preview.knacks === 1 ? "knack" : "knacks"}` : null,
    preview.items > 0 ? `${preview.items} things in her pockets` : null,
    preview.keepsakes > 0 ? `${preview.keepsakes} keepsakes` : null,
    preview.acquaintances > 0 ? `${preview.acquaintances} people she has met` : null,
    preview.bonds > 0 ? `how close ${preview.bonds} of her bonds have grown` : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="Administrator"
        title={`Start ${preview.name} again`}
        lead="Everything she has earned goes. Everything she is stays."
      />

      <p className="mb-8">
        <Link
          href="/settings/adventurers"
          className="text-sm text-hearth-400 underline hover:text-hearth-200"
        >
          ← Back to adventurers
        </Link>
      </p>

      {preview.activeAdventures.length > 0 ? (
        <Card className="mb-6 border-amber-800/50 bg-amber-950/20">
          <h2 className="font-display text-lg text-amber-200">She is in the middle of something</h2>
          <p className="mt-2 text-sm text-amber-100/80">
            {preview.name} is travelling in{" "}
            <span className="text-amber-100">{preview.activeAdventures.join(", ")}</span>, which
            is still going. Starting her again does not remove her from the party — she carries on
            in the story, but arrives at the next scene with nothing she had learned. If that
            adventure was a test, this is exactly what you want. If it was not, finish it first.
          </p>
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="font-display text-lg text-hearth-100">What goes</h2>
        {goes.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm text-hearth-200/80">
            {goes.map((line) => (
              <li key={line as string}>· {line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-hearth-300">
            Nothing, as it happens — she has not earned anything yet. Resetting her would only set
            her four numbers.
          </p>
        )}
      </Card>

      <Card className="mb-8">
        <h2 className="font-display text-lg text-hearth-100">What stays</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-hearth-200/80">
          <li>· her name, her people and her calling</li>
          <li>· how she is described, and her portrait</li>
          <li>· who she is close to — the bond itself, only turned back down to nothing</li>
          <li>· the household she belongs to</li>
        </ul>
      </Card>

      <ResetAdventurer
        characterId={preview.characterId}
        name={preview.name}
        current={preview.stats}
        suggested={suggestedBuild(preview.stats)}
      />
    </main>
  );
}
