import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { memberCampaignFilter } from "@/lib/game/access";
import { STATS, STAT_INFO, RELATIONSHIP_LABELS, kindFromPerspective } from "@/lib/game/rules";
import { PrintButton } from "@/components/campaign/print-button";
import { questBoard } from "@/lib/game/quests";

export const dynamic = "force-dynamic";

/**
 * The adventure, written out to be kept.
 *
 * The transcript on the play screen is a working surface: it scrolls, it is
 * interrupted by dice and buttons, and it only shows the scene in progress. This
 * is the other thing the same events can be — the whole story in order, with
 * everybody's own words in it, laid out to be read on a sofa or printed and put
 * in a drawer.
 *
 * Which is most of the point of a family playing at all. Nobody remembers the
 * dice a year later; they remember that a seven-year-old decided to hum to the
 * dragon, and that it worked.
 */
export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
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
            include: {
              portrait: { select: { version: true } },
              skills: { orderBy: { name: "asc" } },
              inventory: { orderBy: { name: "asc" } },
              relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
              relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      scenes: {
        orderBy: { index: "asc" },
        include: {
          turns: { orderBy: { ordinal: "asc" } },
          // Only whether there is one. The bytes are served by their own route,
          // so that a twelve-chapter journal is not a twelve-megabyte page.
          image: { select: { id: true } },
        },
      },
    },
  });
  if (!campaign) notFound();

  const quests = await questBoard(db, campaign.id, user.id);

  const names = new Map(campaign.party.map((member) => [member.characterId, member.character.name]));
  const inParty = new Set(campaign.party.map((member) => member.characterId));

  const started = campaign.createdAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const lastPlayed = campaign.lastPlayedAt?.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const told = campaign.scenes.filter((scene) => scene.turns.length > 0);

  return (
    <main className="journal mx-auto max-w-3xl px-6 py-12">
      <div className="print-hide mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          ← {campaign.title}
        </Link>
        <PrintButton />
      </div>

      <header className="mb-10 text-center">
        <p className="mb-3 text-sm tracking-[0.2em] text-hearth-400 uppercase">
          {campaign.storyline.title}
        </p>
        <h1 className="font-display text-4xl font-semibold text-hearth-100 sm:text-5xl">
          {campaign.title}
        </h1>
        <p className="mt-4 text-hearth-200/70">
          Begun {started}
          {lastPlayed && lastPlayed !== started ? ` · last played ${lastPlayed}` : ""}
          {" · "}
          {campaign.turnCounter} {campaign.turnCounter === 1 ? "turn" : "turns"}
          {campaign.status === "COMPLETE" ? " · finished" : ""}
        </p>
      </header>

      {/* ---- Who went ------------------------------------------------------ */}
      <section className="mb-12">
        <h2 className="font-display mb-4 border-b border-hearth-800/60 pb-2 text-2xl text-hearth-100">
          Who went
        </h2>

        <div className="space-y-5">
          {campaign.party.map((member) => {
            const bonds = [...member.character.relationshipsA, ...member.character.relationshipsB]
              .map((row) => {
                const other = "characterB" in row ? row.characterB : row.characterA;
                return {
                  otherId: other.id,
                  otherName: other.name,
                  kind: kindFromPerspective(row, member.characterId),
                  bondLevel: row.bondLevel,
                };
              })
              .filter((bond) => inParty.has(bond.otherId));

            return (
              <div key={member.id} className="journal-entry flex items-start gap-4">
                {member.character.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/characters/${member.characterId}/portrait?v=${member.character.portrait.version}`}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                <p className="font-display text-xl text-hearth-100">
                  {member.character.name}
                  <span className="ml-3 text-base text-hearth-400">
                    {member.character.race} {member.character.archetype} · level{" "}
                    {member.character.level}
                  </span>
                </p>

                {member.character.description ? (
                  <p className="mt-1 text-hearth-200/70 italic">{member.character.description}</p>
                ) : null}

                <p className="mt-1 text-sm text-hearth-300">
                  {STATS.map((stat) => `${STAT_INFO[stat].label} ${member.character[stat]}`).join(" · ")}
                </p>

                {member.character.skills.length > 0 ? (
                  <p className="mt-1 text-sm text-hearth-200/70">
                    Good at:{" "}
                    {member.character.skills
                      .map((skill) => `${skill.name} (rank ${skill.rank})`)
                      .join(", ")}
                  </p>
                ) : null}

                {member.character.inventory.length > 0 ? (
                  <p className="mt-1 text-sm text-hearth-200/70">
                    Came home with:{" "}
                    {member.character.inventory
                      .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name))
                      .join(", ")}
                  </p>
                ) : null}

                {bonds.map((bond) => (
                  <p key={bond.otherId} className="mt-1 text-sm text-hearth-200/70">
                    {RELATIONSHIP_LABELS[bond.kind]} {bond.otherName} · bond {bond.bondLevel}
                  </p>
                ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- What they set out to do ---------------------------------------- */}
      {quests.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-4 border-b border-hearth-800/60 pb-2 text-2xl text-hearth-100">
            What they set out to do
          </h2>
          <ul className="space-y-3">
            {quests.map((quest) => (
              <li key={quest.id} className="journal-entry">
                <p className="text-hearth-100">
                  {quest.title}
                  <span className="text-hearth-400">
                    {/* Whose it was matters more than what it was, for the ones
                        that belonged to one girl rather than the party. */}
                    {quest.kind === "PERSONAL" && quest.secretForName
                      ? ` · ${quest.secretForName}'s own`
                      : ""}
                    {" · "}
                    {quest.status === "COMPLETE"
                      ? "finished"
                      : quest.status === "ABANDONED"
                        ? "left behind"
                        : "still open"}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {quest.objectives.map((objective) => (
                    <li key={objective.id} className="text-sm text-hearth-200/70">
                      {objective.done ? "✓" : "○"} {objective.text}
                      {objective.done && objective.foundByName ? (
                        <span className="text-hearth-400">
                          {" — "}
                          {objective.foundByName} found{" "}
                          {objective.itemName && objective.itemName !== objective.text
                            ? objective.itemName
                            : "it"}
                          {objective.consumed ? ", and gave it up to finish this" : ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- The story ----------------------------------------------------- */}
      {told.length === 0 ? (
        <p className="text-hearth-200/70">
          Nothing has happened yet. Come back once the storyteller has set the scene.
        </p>
      ) : (
        told.map((scene) => {
          const act = campaign.storyline.acts.find((entry) => entry.index === scene.actIndex);

          return (
            <section key={scene.id} className="journal-chapter mb-12">
              <h2 className="font-display mb-1 border-b border-hearth-800/60 pb-2 text-2xl text-hearth-100">
                {scene.title}
              </h2>
              <p className="mb-5 text-sm text-hearth-400">
                {act ? `Chapter ${act.index} · ${act.title}` : `Chapter ${scene.actIndex}`}
                {scene.location ? ` · ${scene.location}` : ""}
              </p>

              {scene.image ? (
                <figure className="mb-6 overflow-hidden rounded-xl border border-hearth-800/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/scenes/${scene.id}/image`}
                    alt={`An illustration of ${scene.title}`}
                    className="block w-full"
                  />
                </figure>
              ) : null}

              <div className="space-y-4">
                {scene.turns.map((turn) => {
                  const who = turn.actorCharacterId ? names.get(turn.actorCharacterId) : null;

                  if (turn.type === "NARRATION") {
                    return (
                      <div key={turn.id} className="journal-entry font-display space-y-3 text-lg">
                        {turn.content.split(/\n\s*\n/).map((paragraph, index) => (
                          <p key={index} className="leading-relaxed text-hearth-100">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    );
                  }

                  if (turn.type === "PLAYER_ACTION") {
                    const spoken = (turn.metadata as { spoken?: boolean } | null)?.spoken === true;
                    return (
                      <p key={turn.id} className="journal-entry border-l-2 border-hearth-700 pl-4">
                        <span className="text-sm font-medium text-hearth-300">
                          {who ?? "Someone"}
                          {spoken ? " says" : ""}
                        </span>
                        <br />
                        <span className="text-hearth-200/80 italic">
                          {spoken ? `“${turn.content}”` : turn.content}
                        </span>
                      </p>
                    );
                  }

                  if (turn.type === "DICE_ROLL") {
                    // One line, not the card from the play screen: a year later
                    // nobody wants the arithmetic, but "and it worked" is still
                    // part of the story.
                    const dice = turn.metadata as { outcome?: string; intent?: string } | null;
                    return (
                      <p key={turn.id} className="journal-entry text-sm text-hearth-400">
                        {who ? `${who}: ` : ""}
                        {dice?.intent ?? turn.content}
                        {dice?.outcome ? ` — ${OUTCOME_WORDS[dice.outcome] ?? dice.outcome}` : ""}
                      </p>
                    );
                  }

                  return (
                    <p key={turn.id} className="journal-entry text-sm text-moss-400">
                      {turn.content}
                    </p>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {campaign.status === "COMPLETE" ? (
        <p className="font-display mt-12 text-center text-2xl text-hearth-100">The end</p>
      ) : (
        <p className="mt-12 text-center text-sm text-hearth-400">
          …and it is still going on.
        </p>
      )}
    </main>
  );
}

const OUTCOME_WORDS: Record<string, string> = {
  CRITICAL: "and it went better than anyone hoped",
  SUCCESS: "and it worked",
  PARTIAL: "and it half worked",
  COMPLICATION: "and it went sideways",
};
