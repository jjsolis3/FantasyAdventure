import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { previewReset, suggestedBuild } from "@/lib/game/reset";
import { ResetAdventurer } from "@/components/settings/reset-adventurer";
import { capitalise, pronounsOf, toBe, toBePast, toHave } from "@/lib/game/pronouns";
import { STATS } from "@/lib/game/rules";
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

  // Every sentence on this page is built from what is written on her sheet.
  // It said "Her numbers" over an adventurer called Orin whose player had
  // chosen he/him, which is a small thing that reads as not having listened.
  const they = pronounsOf(preview.pronouns);
  const has = toHave(they.subject);

  /** "1 keepsake" rather than "1 keepsakes", which is what this list used to say. */
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const goes = [
    preview.level > 1 ? `${they.possessive} level — back to 1 from ${preview.level}` : null,
    preview.xp > 0 ? `${preview.xp} experience` : null,
    preview.skills > 0
      ? `${count(preview.skills, "skill", "skills")} ${they.subject} ${has} learned`
      : null,
    preview.practices > 0 ? `what ${they.subject} ${has} been practising` : null,
    preview.knacks > 0 ? count(preview.knacks, "knack", "knacks") : null,
    preview.items > 0
      ? `${count(preview.items, "thing", "things")} in ${they.possessive} pockets`
      : null,
    preview.keepsakes > 0 ? count(preview.keepsakes, "keepsake", "keepsakes") : null,
    preview.acquaintances > 0
      ? `${count(preview.acquaintances, "person", "people")} ${they.subject} ${has} met`
      : null,
    preview.bonds > 0
      ? preview.bonds === 1
        ? `how close ${they.possessive} one bond has grown`
        : `how close ${preview.bonds} of ${they.possessive} bonds have grown`
      : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="Administrator"
        title={`Put ${preview.name} right`}
        lead={`Fix ${they.possessive} numbers without costing ${they.object} anything — or start ${they.object} again from the day ${they.subject} ${toBePast(they.subject)} built.`}
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
          <h2 className="font-display text-lg text-amber-200">
            {capitalise(they.subject)} {toBe(they.subject)} in the middle of something
          </h2>
          <p className="mt-2 text-sm text-amber-100/80">
            {preview.name} is travelling in{" "}
            <span className="text-amber-100">{preview.activeAdventures.join(", ")}</span>, which is
            still going. Neither of these removes {they.object} from the party.{" "}
            <span className="text-amber-100">Re-laying {they.possessive} numbers</span> is safe
            mid-story — nothing {they.subject} {has} is lost.{" "}
            <span className="text-amber-100">Starting again</span> is not: {they.subject} carries on
            in the story but arrives at the next scene with nothing {they.subject} had learned. If
            that adventure was a test, this is exactly what you want. If it was not, finish it
            first.
          </p>
        </Card>
      ) : null}

      {/* Only the destructive path takes anything, so the list is labelled for
          it rather than for the page. The safe one has no "what goes" — that is
          the whole reason it exists, and burying that under a wall of losses
          was how a household came to think the only option was the costly one. */}
      <Card className="mb-6 border-rose-900/40">
        <h2 className="font-display text-lg text-hearth-100">
          What starting again takes
        </h2>
        {goes.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm text-hearth-200/80">
            {goes.map((line) => (
              <li key={line as string}>· {line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-hearth-300">
            Nothing, as it happens — {they.subject} {has} not earned anything yet. Either option
            would only set {they.possessive} {STATS.length} numbers.
          </p>
        )}
        <p className="mt-3 text-sm text-moss-400">
          Re-laying {they.possessive} numbers takes none of it.
        </p>
      </Card>

      <Card className="mb-8">
        <h2 className="font-display text-lg text-hearth-100">What stays, either way</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-hearth-200/80">
          <li>· {they.possessive} name, {they.possessive} people and {they.possessive} calling</li>
          <li>· how {they.subject} {toBe(they.subject)} described, and {they.possessive} portrait</li>
          <li>
            · who {they.subject} {toBe(they.subject)} close to — the bond itself, only turned back
            down to nothing when starting again
          </li>
          <li>· the household {they.subject} {toBe(they.subject)} part of</li>
        </ul>
      </Card>

      <ResetAdventurer
        characterId={preview.characterId}
        name={preview.name}
        pronouns={preview.pronouns}
        archetype={preview.archetype}
        current={preview.stats}
        suggested={suggestedBuild(preview.stats)}
        level={preview.level}
        xp={preview.xp}
      />
    </main>
  );
}
