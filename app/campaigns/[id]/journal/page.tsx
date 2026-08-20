import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { memberCampaignFilter } from "@/lib/game/access";
import {
  STATS,
  STAT_INFO,
  RELATIONSHIP_LABELS,
  kindFromPerspective,
} from "@/lib/game/rules";
import { PrintButton } from "@/components/campaign/print-button";
import { questBoard } from "@/lib/game/quests";
import { journeyFrom, placesVisited } from "@/lib/game/journey";
import { CONFIRMED_TIES } from "@/lib/game/ties";
import { recapsFor } from "@/lib/game/recap";
import { knownPeople } from "@/lib/game/acquaintances";
import { KnownPeople } from "@/components/campaign/known-people";

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
export default async function JournalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
              relationshipsA: {
                where: CONFIRMED_TIES,
                include: { characterB: { select: { id: true, name: true } } },
              },
              relationshipsB: {
                where: CONFIRMED_TIES,
                include: { characterA: { select: { id: true, name: true } } },
              },
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

  const names = new Map(
    campaign.party.map((member) => [member.characterId, member.character.name]),
  );
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

  /**
   * The story in chapters rather than in scenes.
   *
   * The journal has always been a flat run of scenes, and a scene is an
   * accident of pacing — it ends when the party moves, so a chapter can be one
   * scene or six and the reader has no way to tell where they are. A family
   * picking this up a week later is not looking for "The Chamber Under the
   * Mill"; they are looking for chapter two.
   *
   * Chapters that were never played are left out entirely rather than shown
   * empty, which keeps the contents honest about how far this adventure got.
   */
  const chapters = campaign.storyline.acts
    .map((act) => ({
      act,
      scenes: told.filter((scene) => scene.actIndex === act.index),
    }))
    .filter((chapter) => chapter.scenes.length > 0);

  // What actually changed in each chapter, read back off the milestones the
  // game wrote at the time. The same ledger the play screen shows above the
  // story — the difference is that here it is a chapter's worth rather than a
  // scene's, which is the unit somebody rereading actually wants.
  const ledgers = new Map(
    await Promise.all(
      chapters.map(async (chapter) => {
        const recaps = await recapsFor(chapter.scenes);
        const changed: string[] = [];
        for (const recap of recaps) {
          for (const line of recap.changed) {
            if (!changed.includes(line)) changed.push(line);
          }
        }
        const rolls = recaps.reduce(
          (sum, recap) => ({
            thrown: sum.thrown + recap.rolls.thrown,
            landed: sum.landed + recap.rolls.landed,
          }),
          { thrown: 0, landed: 0 },
        );
        return [chapter.act.index, { changed, rolls }] as const;
      }),
    ),
  );

  // Who this party knows from earlier adventures. In the keepsake as well as at
  // the table, because "we know the beekeeper" is one of the few things that
  // outlives the adventure it happened in.
  const people = await knownPeople(db, {
    campaignId: campaign.id,
    party: campaign.party.map((member) => ({
      characterId: member.characterId,
      name: member.character.name,
    })),
  });

  // Only scenes that actually happened. A scene opened and never played has a
  // location the party never saw, and putting it on the route would promise a
  // place that is not in the story.
  const journey = journeyFrom(told);
  const places = placesVisited(journey);

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
          {lastPlayed && lastPlayed !== started
            ? ` · last played ${lastPlayed}`
            : ""}
          {" · "}
          {campaign.turnCounter} {campaign.turnCounter === 1 ? "turn" : "turns"}
          {campaign.status === "COMPLETE" ? " · finished" : ""}
        </p>
      </header>

      {/* ---- What is in here ------------------------------------------------ */}
      {chapters.length > 1 ? (
        <nav className="print-hide mb-12 rounded-xl border border-hearth-800/60 bg-hearth-900/20 p-4">
          <h2 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
            Chapters
          </h2>
          <ol className="space-y-1">
            {chapters.map((chapter) => (
              <li key={chapter.act.index} className="text-sm">
                <a
                  href={`#chapter-${chapter.act.index}`}
                  className="text-hearth-200 underline underline-offset-4 hover:text-hearth-100"
                >
                  {chapter.act.index}. {chapter.act.title}
                </a>
                <span className="ml-2 text-hearth-500">
                  {chapter.scenes.length}{" "}
                  {chapter.scenes.length === 1 ? "scene" : "scenes"}
                </span>
              </li>
            ))}
          </ol>
          {/* Hidden from the printout, where the pages themselves are the
              index and a list of dead links is just a page of underlines. */}
          <p className="mt-2 text-xs text-hearth-500">
            Jump straight to a chapter, or print the whole thing and put it in a
            drawer.
          </p>
        </nav>
      ) : null}

      {/* ---- Who went ------------------------------------------------------ */}
      <section className="mb-12">
        <h2 className="font-display mb-4 border-b border-hearth-800/60 pb-2 text-2xl text-hearth-100">
          Who went
        </h2>

        <div className="space-y-5">
          {campaign.party.map((member) => {
            const bonds = [
              ...member.character.relationshipsA,
              ...member.character.relationshipsB,
            ]
              .map((row) => {
                const other =
                  "characterB" in row ? row.characterB : row.characterA;
                return {
                  otherId: other.id,
                  otherName: other.name,
                  kind: kindFromPerspective(row, member.characterId),
                  bondLevel: row.bondLevel,
                };
              })
              .filter((bond) => inParty.has(bond.otherId));

            return (
              <div
                key={member.id}
                className="journal-entry flex items-start gap-4"
              >
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
                      {member.character.race} {member.character.archetype} ·
                      level {member.character.level}
                    </span>
                  </p>

                  {member.character.description ? (
                    <p className="mt-1 text-hearth-200/70 italic">
                      {member.character.description}
                    </p>
                  ) : null}

                  <p className="mt-1 text-sm text-hearth-300">
                    {STATS.map(
                      (stat) =>
                        `${STAT_INFO[stat].label} ${member.character[stat]}`,
                    ).join(" · ")}
                  </p>

                  {member.character.skills.length > 0 ? (
                    <p className="mt-1 text-sm text-hearth-200/70">
                      Good at:{" "}
                      {member.character.skills
                        .map((skill) => `${skill.name} (rank ${skill.rank})`)
                        .join(", ")}
                    </p>
                  ) : null}

                  {/* What she packed, and what the story gave her, told apart —
                    "we brought the rope" and "we found the key" are different
                    kinds of good, and a single list flattens both. */}
                  {member.character.inventory.filter((item) => item.brought)
                    .length > 0 ? (
                    <p className="mt-1 text-sm text-hearth-200/70">
                      Set out with:{" "}
                      {member.character.inventory
                        .filter((item) => item.brought)
                        .map((item) => item.name)
                        .join(", ")}
                    </p>
                  ) : null}

                  {member.character.inventory.filter((item) => !item.brought)
                    .length > 0 ? (
                    <p className="mt-1 text-sm text-hearth-200/70">
                      {/* Only "came home" once they actually have. A journal read
                        mid-adventure was telling a family what they came home
                        with while the story was still going on. */}
                      {campaign.status === "COMPLETE"
                        ? "Came home with"
                        : "Carrying"}
                      :{" "}
                      {member.character.inventory
                        .filter((item) => !item.brought)
                        .map((item) =>
                          item.quantity > 1
                            ? `${item.name} ×${item.quantity}`
                            : item.name,
                        )
                        .join(", ")}
                    </p>
                  ) : null}

                  {bonds.map((bond) => (
                    <p
                      key={bond.otherId}
                      className="mt-1 text-sm text-hearth-200/70"
                    >
                      {RELATIONSHIP_LABELS[bond.kind]} {bond.otherName} · bond{" "}
                      {bond.bondLevel}
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
                    <li
                      key={objective.id}
                      className="text-sm text-hearth-200/70"
                    >
                      {objective.done ? "✓" : "○"} {objective.text}
                      {objective.done && objective.foundByName ? (
                        <span className="text-hearth-400">
                          {" — "}
                          {objective.foundByName} found{" "}
                          {objective.itemName &&
                          objective.itemName !== objective.text
                            ? objective.itemName
                            : "it"}
                          {objective.consumed
                            ? ", and gave it up to finish this"
                            : ""}
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

      {/* ---- Where they went ------------------------------------------------ */}
      {journey.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-1 border-b border-hearth-800/60 pb-2 text-2xl text-hearth-100">
            Where they went
          </h2>
          <p className="mb-5 text-sm text-hearth-400">
            {places === 1
              ? "One place, so far."
              : `${places} places, in the order they found them.`}
          </p>

          <ol className="space-y-0">
            {journey.map((stop, index) => (
              <li
                key={`${stop.location}-${stop.sceneIndex}`}
                className="journal-entry flex gap-4"
              >
                {/* The line itself: a dot per stop, joined by a rule, running
                    out before the first and after the last so the route reads
                    as a path rather than a closed list. */}
                <div
                  className="flex w-3 shrink-0 flex-col items-center"
                  aria-hidden
                >
                  <div
                    className={`w-px flex-1 ${index === 0 ? "bg-transparent" : "bg-hearth-700/60"}`}
                  />
                  <div
                    className={`my-1 h-2 w-2 rounded-full ${
                      stop.returning
                        ? "border border-hearth-500 bg-transparent"
                        : "bg-hearth-500"
                    }`}
                  />
                  <div
                    className={`w-px flex-1 ${
                      index === journey.length - 1
                        ? "bg-transparent"
                        : "bg-hearth-700/60"
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1 py-2">
                  <p className="text-hearth-100">
                    {stop.location}
                    {stop.returning ? (
                      <span className="text-hearth-400"> — back again</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-hearth-200/60">
                    Chapter {stop.actIndex} · {stop.scenes.join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* ---- People you know ------------------------------------------------ */}
      {people.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-1 border-b border-hearth-800/60 pb-2 text-2xl text-hearth-100">
            People you know
          </h2>
          <p className="mb-5 text-sm text-hearth-400">
            From other adventures. They remember you, and the storyteller knows
            they do.
          </p>
          <div className="journal-entry">
            <KnownPeople people={people} />
          </div>
        </section>
      ) : null}

      {/* ---- The story ----------------------------------------------------- */}
      {told.length === 0 ? (
        <p className="text-hearth-200/70">
          Nothing has happened yet. Come back once the storyteller has set the
          scene.
        </p>
      ) : (
        chapters.map((chapter) => {
          const ledger = ledgers.get(chapter.act.index);

          return (
            <section
              key={chapter.act.index}
              id={`chapter-${chapter.act.index}`}
              className="journal-chapter mb-12 scroll-mt-6"
            >
              <p className="text-sm tracking-[0.15em] text-hearth-400 uppercase">
                Chapter {chapter.act.index}
              </p>
              <h2 className="font-display mb-3 border-b border-hearth-800/60 pb-2 text-3xl text-hearth-100">
                {chapter.act.title}
              </h2>

              {/* The ledger before the prose, deliberately. Somebody opening
                  this a week later wants "where were we" answered in six lines
                  before they commit to rereading eight hundred words — and the
                  six lines are facts the game wrote at the time rather than a
                  model's second-hand summary of them. */}
              {ledger && ledger.changed.length > 0 ? (
                <div className="journal-entry mb-6 rounded-lg border border-hearth-800/50 bg-hearth-900/20 p-4">
                  <h3 className="mb-2 text-xs tracking-wide text-hearth-400 uppercase">
                    What changed
                  </h3>
                  <ul className="space-y-1">
                    {ledger.changed.map((line) => (
                      <li key={line} className="text-sm text-moss-400/90">
                        {line}
                      </li>
                    ))}
                  </ul>
                  {ledger.rolls.thrown > 0 ? (
                    <p className="mt-2 text-xs text-hearth-500">
                      {ledger.rolls.landed} of {ledger.rolls.thrown} rolls
                      landed
                    </p>
                  ) : null}
                </div>
              ) : null}

              {chapter.scenes.map((scene) => (
                <div key={scene.id} className="journal-scene mb-10">
                  {/* The opening scene of a chapter is usually named after the
                      chapter itself, and printing both makes the page look
                      like it stuttered. The chapter heading above is the
                      better of the two, so this one steps aside when they
                      agree. */}
                  {scene.title === chapter.act.title ? null : (
                    <h3 className="font-display mb-1 text-2xl text-hearth-100">
                      {scene.title}
                    </h3>
                  )}
                  {scene.location ? (
                    <p className="mb-5 text-sm text-hearth-400">
                      {scene.location}
                    </p>
                  ) : null}

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
                      const who = turn.actorCharacterId
                        ? names.get(turn.actorCharacterId)
                        : null;

                      if (turn.type === "NARRATION") {
                        return (
                          <div
                            key={turn.id}
                            className="journal-entry font-display space-y-3 text-lg"
                          >
                            {turn.content
                              .split(/\n\s*\n/)
                              .map((paragraph, index) => (
                                <p
                                  key={index}
                                  className="leading-relaxed text-hearth-100"
                                >
                                  {paragraph}
                                </p>
                              ))}
                          </div>
                        );
                      }

                      if (turn.type === "PLAYER_ACTION") {
                        const spoken =
                          (turn.metadata as { spoken?: boolean } | null)
                            ?.spoken === true;
                        return (
                          <p
                            key={turn.id}
                            className="journal-entry border-l-2 border-hearth-700 pl-4"
                          >
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
                        const dice = turn.metadata as {
                          outcome?: string;
                          intent?: string;
                        } | null;
                        return (
                          <p
                            key={turn.id}
                            className="journal-entry text-sm text-hearth-400"
                          >
                            {who ? `${who}: ` : ""}
                            {dice?.intent ?? turn.content}
                            {dice?.outcome
                              ? ` — ${OUTCOME_WORDS[dice.outcome] ?? dice.outcome}`
                              : ""}
                          </p>
                        );
                      }

                      return (
                        <p
                          key={turn.id}
                          className="journal-entry text-sm text-moss-400"
                        >
                          {turn.content}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          );
        })
      )}

      {campaign.status === "COMPLETE" ? (
        <p className="font-display mt-12 text-center text-2xl text-hearth-100">
          The end
        </p>
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
