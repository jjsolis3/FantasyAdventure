import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { memberCampaignFilter } from "@/lib/game/access";
import { questBoard } from "@/lib/game/quests";
import { journeyFrom, placesVisited } from "@/lib/game/journey";
import {
  statPointsUnspent,
  statsOf,
  type StatBlock,
} from "@/lib/game/rules";
import { knacksUnspent } from "@/lib/game/knacks";
import { tally, totalXp, verdict, xpFromQuests, xpFromRolls } from "@/lib/game/summary";
import type { CheckOutcome } from "@/lib/engine/dice";
import { Card, PageTitle } from "@/components/ui";
import { capitalise, pronounsOf, toHave } from "@/lib/game/pronouns";

export const dynamic = "force-dynamic";

/**
 * How it went.
 *
 * The ending used to be one line in a transcript that had already scrolled
 * past. Everything the evening produced was real and recorded and scattered:
 * quests on one page, keepsakes on another, experience folded silently into a
 * number, and the private aim nobody else had seen revealed in passing.
 *
 * This is the same evening read back, per girl, at the moment she most wants to
 * know what she got. Nothing here is stored — it is all derived, so it cannot
 * drift, and it stays true if a turn is taken back afterwards.
 */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: memberCampaignFilter(id, user.id),
    include: {
      storyline: { select: { title: true } },
      party: {
        orderBy: { position: "asc" },
        include: {
          character: {
            include: {
              skills: { orderBy: { name: "asc" } },
              knacks: true,
              keepsakes: { where: { campaignId: id }, orderBy: { createdAt: "asc" } },
              inventory: { where: { foundInCampaignId: id }, orderBy: { name: "asc" } },
              acquaintances: { where: { metInCampaignId: id }, orderBy: { name: "asc" } },
            },
          },
        },
      },
      scenes: { orderBy: { index: "asc" }, include: { turns: { orderBy: { ordinal: "asc" } } } },
    },
  });
  if (!campaign) notFound();

  // Personal aims are shown to everybody here, whatever they were during play.
  // The story is over; the reveal is the point.
  const quests = await questBoard(db, campaign.id, user.id);
  const questRows = await db.quest.findMany({
    where: { campaignId: campaign.id },
    select: { kind: true, status: true, secretForCharacterId: true, title: true },
  });

  const partyIds = campaign.party.map((member) => member.characterId);

  // Every roll of the adventure, read back out of the transcript. A character's
  // experience is cumulative across every story, so what she earned *here* has
  // to be reconstructed — and the rolls are still sitting there with their
  // outcomes on them.
  const rolls = campaign.scenes
    .flatMap((scene) => scene.turns)
    .filter((turn) => turn.type === "DICE_ROLL" && turn.actorCharacterId !== null)
    .map((turn) => ({
      characterId: turn.actorCharacterId!,
      outcome: (turn.metadata as { outcome?: CheckOutcome } | null)?.outcome ?? "PARTIAL",
    }));

  const fromRolls = xpFromRolls(rolls);
  const fromQuests = xpFromQuests(questRows, partyIds);
  const counts = tally(questRows);

  const told = campaign.scenes.filter((scene) => scene.turns.length > 0);
  const places = placesVisited(journeyFrom(told));
  const finished = campaign.status === "COMPLETE";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={campaign.storyline.title}
        title={finished ? "How it went" : "How it is going"}
        lead={verdict(counts, finished)}
      />

      <div className="mb-6 flex flex-wrap gap-4">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          ← {campaign.title}
        </Link>
        <Link
          href={`/campaigns/${campaign.id}/journal`}
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          Read the whole story →
        </Link>
      </div>

      <div className="space-y-6">
        {/* What the party did together, before what each of them got. */}
        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">Between you</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Chapters finished", value: counts.chapters },
              { label: "Errands done", value: counts.errands },
              { label: "Places seen", value: places },
              { label: "Turns taken", value: campaign.turnCounter },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="font-display text-2xl text-hearth-100 tabular-nums">{stat.value}</dd>
                <dt className="text-sm text-hearth-400">{stat.label}</dt>
              </div>
            ))}
          </dl>

          {counts.chaptersLeft > 0 ? (
            <p className="mt-4 text-sm text-hearth-400">
              {counts.chaptersLeft} {counts.chaptersLeft === 1 ? "chapter" : "chapters"} the story
              moved past. You found another way round, which counts.
            </p>
          ) : null}
        </Card>

        {/* Then each of them, in party order. */}
        {campaign.party.map((member) => {
          const character = member.character;
          const stats: StatBlock = statsOf(character);

          const them = pronounsOf(character.pronouns);
          const earned = totalXp(character.id, fromRolls, fromQuests);
          const rolled = fromRolls.get(character.id) ?? 0;
          const quested = fromQuests.get(character.id) ?? 0;

          // Her own aim, revealed now whether or not she managed it. Hiding a
          // failed one would make the reveal a reward rather than a story.
          const ownAim = questRows.find(
            (quest) => quest.kind === "PERSONAL" && quest.secretForCharacterId === character.id,
          );

          const pointsWaiting = statPointsUnspent(stats, character.xp);
          const knackWaiting = knacksUnspent(character.level, character.knacks.length);
          const brought = character.inventory.filter((item) => item.brought);
          const found = character.inventory.filter((item) => !item.brought);

          return (
            <Card key={member.id}>
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-display text-xl text-hearth-100">{character.name}</h2>
                <span className="text-sm text-hearth-400">
                  {character.race} {character.archetype} · level {character.level}
                </span>
              </div>

              <p className="text-hearth-200/80">
                {earned > 0 ? (
                  <>
                    <span className="text-hearth-100">{earned} experience</span> on this adventure —{" "}
                    {rolled} from the dice
                    {quested > 0 ? `, ${quested} from what you finished` : ""}.
                  </>
                ) : (
                  "No experience yet — it arrives with the first roll."
                )}
              </p>

              {ownAim ? (
                <p className="mt-3 text-sm text-hearth-200/80">
                  <span className="text-hearth-400">
                    {capitalise(them.possessive)} own aim was
                  </span>{" "}
                  {ownAim.title} —{" "}
                  {ownAim.status === "COMPLETE" ? (
                    <span className="text-moss-400">and {them.subject} did it.</span>
                  ) : (
                    <span className="text-hearth-400">
                      which will have to wait for another story.
                    </span>
                  )}
                </p>
              ) : null}

              {character.keepsakes.length > 0 ? (
                <>
                  <h3 className="mt-5 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                    Given up
                  </h3>
                  <ul className="space-y-1">
                    {character.keepsakes.map((keepsake) => (
                      <li key={keepsake.id} className="text-sm text-hearth-200/80">
                        {keepsake.name}
                        <span className="text-hearth-400"> — {keepsake.note}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {found.length > 0 || brought.length > 0 ? (
                <p className="mt-4 text-sm text-hearth-200/70">
                  {found.length > 0 ? (
                    <>
                      <span className="text-hearth-400">Came home with</span>{" "}
                      {found.map((item) => item.name).join(", ")}.{" "}
                    </>
                  ) : null}
                  {brought.length > 0 ? (
                    <>
                      <span className="text-hearth-400">
                        Still {toHave(them.subject)} what {them.subject} packed:
                      </span>{" "}
                      {brought.map((item) => item.name).join(", ")}.
                    </>
                  ) : null}
                </p>
              ) : null}

              {character.acquaintances.length > 0 ? (
                <p className="mt-3 text-sm text-hearth-200/70">
                  <span className="text-hearth-400">Will be remembered by</span>{" "}
                  {character.acquaintances.map((person) => person.name).join(", ")}.
                </p>
              ) : null}

              {/* The thing she should go and do next, if there is one. */}
              {pointsWaiting > 0 || knackWaiting > 0 ? (
                <p className="mt-4 rounded-lg border border-hearth-700/50 bg-hearth-800/20 p-3 text-sm text-hearth-200">
                  {knackWaiting > 0
                    ? `Something new is waiting to be chosen${pointsWaiting > 0 ? `, and ${pointsWaiting} ${pointsWaiting === 1 ? "point" : "points"} to spend` : ""}.`
                    : `${pointsWaiting} ${pointsWaiting === 1 ? "point" : "points"} to spend.`}{" "}
                  <Link
                    href={`/characters/${character.id}`}
                    className="underline hover:text-hearth-100"
                  >
                    Go and see.
                  </Link>
                </p>
              ) : null}
            </Card>
          );
        })}

        {/* The board, in full, with every personal aim now on it. */}
        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">Everything you set out to do</h2>
          <ul className="space-y-2">
            {quests.map((quest) => (
              <li key={quest.id} className="flex gap-2 text-sm">
                <span
                  className={quest.status === "COMPLETE" ? "text-moss-400" : "text-hearth-600"}
                  aria-hidden
                >
                  {quest.status === "COMPLETE" ? "✓" : "—"}
                </span>
                <span className="text-hearth-200/80">
                  {quest.title}
                  {quest.kind === "PERSONAL" && quest.secretForName ? (
                    <span className="text-hearth-400"> · {quest.secretForName}&rsquo;s own</span>
                  ) : null}
                  {quest.status === "ABANDONED" ? (
                    <span className="text-hearth-500"> · left behind</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
