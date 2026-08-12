import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { memberCampaignFilter } from "@/lib/game/access";
import { picturesFor } from "@/lib/game/pictures";
import { pictureSubjects } from "@/lib/game/picture-subjects";
import { PictureSlot } from "@/components/campaign/picture-slot";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    kind: "PERSON" as const,
    title: "People you have met",
    blurb:
      "Everybody the story has bothered to remember. Draw one and their face turns up on the television whenever they are in the scene.",
    empty: "Nobody yet. They appear here as soon as you meet somebody worth remembering.",
  },
  {
    kind: "PLACE" as const,
    title: "Places you have been",
    blurb: "Somewhere you might go back to. Worth drawing once and keeping.",
    empty: "Nowhere yet. Places appear here once the story has settled on one.",
  },
  {
    kind: "SCENE" as const,
    title: "Chapters so far",
    blurb:
      "A drawing here replaces the one the storyteller made up, everywhere it appears — at the table and on the big screen.",
    empty: "Once the adventure starts, every chapter you play shows up here.",
  },
];

/**
 * The gallery.
 *
 * Every player can add to this, not only the host — see the note in
 * `lib/game/pictures.ts`. The person most likely to have drawn the beekeeper is
 * the ten-year-old who met him.
 */
export default async function PicturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    select: { id: true, title: true },
  });
  if (!campaign) notFound();

  const [subjects, pictures] = await Promise.all([pictureSubjects(id), picturesFor(id)]);

  // Addressed the same way the database keys them, so a subject and its picture
  // find each other without a second lookup per frame.
  const byAddress = new Map(
    pictures.map((picture) => [`${picture.kind}:${picture.key}`, picture]),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={campaign.title}
        title="Pictures"
        lead="Draw somebody, photograph it, and it is in the game. Anyone at the table can add one."
      />

      <p className="mb-8">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-sm text-hearth-400 underline hover:text-hearth-200"
        >
          ← Back to the adventure
        </Link>
      </p>

      <div className="space-y-10">
        {SECTIONS.map((section) => {
          const mine = subjects.filter((subject) => subject.kind === section.kind);

          return (
            <section key={section.kind}>
              <h2 className="font-display text-xl text-hearth-100">{section.title}</h2>
              <p className="mt-1 mb-4 text-sm text-hearth-400">{section.blurb}</p>

              {mine.length === 0 ? (
                <Card>
                  <p className="text-sm text-hearth-300">{section.empty}</p>
                </Card>
              ) : (
                <div
                  className={`grid gap-4 ${
                    section.kind === "PERSON" ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2"
                  }`}
                >
                  {mine.map((subject) => (
                    <PictureSlot
                      key={`${subject.kind}:${subject.key}`}
                      campaignId={campaign.id}
                      kind={subject.kind}
                      subjectKey={subject.key}
                      label={subject.label}
                      about={subject.about}
                      picture={byAddress.get(`${subject.kind}:${subject.key}`) ?? null}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
