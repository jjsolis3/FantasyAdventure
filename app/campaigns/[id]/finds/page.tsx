import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { memberCampaignFilter, membershipFor } from "@/lib/game/access";
import { questBoard } from "@/lib/game/quests";
import { giveItemAction } from "@/lib/game/item-actions";
import { QuestList } from "@/components/campaign/quest-list";
import { Alert, Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The quest board: what the party set out to do, what they are carrying, and
 * what they gave up along the way.
 *
 * This used to compare the storyline's wish-list against everybody's pockets on
 * every page load and show the result. That was honest but it was only ever a
 * report — finding the last thing changed nothing and was never announced.
 * Quests are the same list made durable, so it can have an ending: the moment
 * of completion is written into the transcript, the item that bought it leaves
 * the pack, and what it bought is remembered on the sheet of whoever gave it up.
 */
export default async function FindsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    include: {
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            select: {
              id: true,
              name: true,
              userId: true,
              inventory: { orderBy: { name: "asc" } },
              keepsakes: { where: { campaignId: id }, orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!campaign) notFound();

  const [quests, membership] = await Promise.all([
    questBoard(db, campaign.id),
    membershipFor(campaign.id, user.id),
  ]);

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
        holderId: member.character.id,
        holder: member.character.name,
        // Your own adventurers' things are yours to move; the household running
        // the table can move anybody's.
        movable: membership.isOwner || member.character.userId === user.id,
      })),
  );

  const given = campaign.party.flatMap((member) =>
    member.character.keepsakes.map((keepsake) => ({
      id: keepsake.id,
      name: keepsake.name,
      note: keepsake.note,
      holder: member.character.name,
    })),
  );

  const others = campaign.party.map((member) => ({
    id: member.character.id,
    name: member.character.name,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={campaign.title}
        title="The quest board"
        lead="What you set out to do, what you are carrying, and what it cost to finish."
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
        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">Quests</h2>
          <p className="mb-4 text-sm text-hearth-400">
            A chapter opens its own quest as you reach it, and the storyteller may add errands along
            the way. The things they ask for are made findable — there is always more than one way
            to come by them.
          </p>
          <QuestList quests={quests} />
        </Card>

        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">In your pockets</h2>
          <p className="mb-4 text-sm text-hearth-400">
            Whoever picked something up is carrying it, and keeps it after the adventure ends —
            unless a quest spends it. Anything can be handed to somebody else.
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
                    <span className="text-sm text-hearth-400">{item.holder}</span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-hearth-200/70">{item.description}</p>
                  ) : null}

                  {item.movable && others.length > 1 ? (
                    <form action={giveItemAction} className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <label className="text-sm text-hearth-400">
                        <span className="sr-only">Give {item.name} to</span>
                        <select
                          name="toCharacterId"
                          defaultValue={others.find((other) => other.id !== item.holderId)?.id ?? ""}
                          aria-label={`Give ${item.name} to`}
                          className="rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-2 py-1 text-sm text-hearth-100 focus:border-hearth-600 focus:outline-none"
                        >
                          {others
                            .filter((other) => other.id !== item.holderId)
                            .map((other) => (
                              <option key={other.id} value={other.id} className="bg-hearth-950">
                                {other.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        aria-label={`Hand over ${item.name}`}
                        className="rounded-lg border border-hearth-700 px-3 py-1 text-sm text-hearth-300 transition-colors hover:bg-hearth-800/50"
                      >
                        Hand it over
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {given.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">Given up</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Things that were spent finishing a quest. They have left the pack, but not the story —
              these stay on the sheet of whoever handed them over.
            </p>
            <ul className="space-y-2">
              {given.map((keepsake) => (
                <li key={keepsake.id} className="rounded-lg border border-hearth-800/50 p-3 text-sm">
                  <span className="text-hearth-100">{keepsake.name}</span>
                  <span className="text-hearth-400">
                    {" "}
                    — {keepsake.holder} {keepsake.note}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
