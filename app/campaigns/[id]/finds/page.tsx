import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { memberCampaignFilter } from "@/lib/game/access";
import { reconcileFinds } from "@/lib/game/finds";
import { Alert, Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * What the party has found, and what they are still looking for.
 *
 * Items were always being collected — the storyteller has always been able to
 * hand something over, and it has always been kept on the character who took
 * it. What was missing was somewhere to look at all of it at once. Spread
 * across four character sheets on four different phones, "do we have the key?"
 * was a question the table could not answer without asking each other.
 *
 * The list of what is still missing comes from the storyline rather than from
 * the model: a chapter names what it wants the party to come away holding, and
 * anything they are carrying that plausibly matches counts. Plausibly, because
 * the storyteller writes "a small brass key, green at the teeth" where the
 * storyline said "the brass key", and a family should not be sent hunting for
 * something already in a pocket.
 */
export default async function FindsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    include: {
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            select: {
              id: true,
              name: true,
              userId: true,
              inventory: { orderBy: { name: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!campaign) notFound();

  // Only what was found *here*. An adventurer arrives carrying whatever they
  // earned elsewhere, and this page is about this story.
  const carried = campaign.party.flatMap((member) =>
    member.character.inventory
      .filter((item) => item.foundInCampaignId === campaign.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        holder: member.character.name,
        yours: member.character.userId === user.id,
      })),
  );

  // Chapters the party has reached. What a later chapter wants is a spoiler.
  const reached = campaign.storyline.acts.filter((act) => act.index <= campaign.currentActIndex);
  const sought = reconcileFinds(
    reached.flatMap((act) =>
      act.seeks.map((name) => ({ name, actIndex: act.index, actTitle: act.title })),
    ),
    carried.map((item) => ({ name: item.name, holder: item.holder })),
  );

  const missing = sought.filter((item) => item.foundBy === null);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={campaign.title}
        title="What you have found"
        lead="Everything the party has picked up on this adventure, and anything this part of the story is still waiting on."
      />

      <div className="mb-6">
        <Link
          href={`/campaigns/${campaign.id}/play`}
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          ← Back to the table
        </Link>
      </div>

      <div className="space-y-6">
        {sought.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Still to find</h2>
            <p className="mb-4 text-sm text-hearth-400">
              {missing.length === 0
                ? "Nothing — this part of the story has given up everything it was holding."
                : "The storyteller has been told to make these findable. There is always more than one way to come by them."}
            </p>

            <ul className="space-y-2">
              {sought.map((item) => (
                <li
                  key={`${item.actIndex}-${item.name}`}
                  className={`flex flex-wrap items-baseline gap-x-3 rounded-lg border p-3 ${
                    item.foundBy
                      ? "border-moss-800/50 bg-moss-900/10"
                      : "border-hearth-800/60 bg-hearth-900/20"
                  }`}
                >
                  <span className={item.foundBy ? "text-moss-400" : "text-hearth-500"} aria-hidden>
                    {item.foundBy ? "✓" : "○"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-hearth-100">{item.name}</span>
                    <span className="block text-sm text-hearth-500">
                      Chapter {item.actIndex} · {item.actTitle}
                    </span>
                  </span>
                  <span className="text-sm text-hearth-400">
                    {item.foundBy ? `${item.foundBy} has it` : "not yet"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">In your pockets</h2>
          <p className="mb-4 text-sm text-hearth-400">
            Whoever picked something up is the one carrying it, and they keep it after the adventure
            ends.
          </p>

          {carried.length === 0 ? (
            <Alert tone="info">
              Nothing yet. Things turn up by being looked for — under, behind, inside, and by asking
              somebody who would know.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {carried.map((item) => (
                <li key={item.id} className="rounded-lg border border-hearth-800/60 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-hearth-100">
                      {item.name}
                      {item.quantity > 1 ? (
                        <span className="text-hearth-400"> ×{item.quantity}</span>
                      ) : null}
                    </span>
                    <span className="text-sm text-hearth-400">
                      {item.holder}
                      {item.yours ? " (yours)" : ""}
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-hearth-200/70">{item.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
