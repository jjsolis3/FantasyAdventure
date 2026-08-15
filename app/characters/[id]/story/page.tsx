import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { chronicleFor, type Chronicle } from "@/lib/game/chronicle";
import { reachableCharacterWhere } from "@/lib/game/ties";
import { Card, PageTitle } from "@/components/ui";
import { capitalise, pronounsOf, toHave } from "@/lib/game/pronouns";

export const dynamic = "force-dynamic";

/**
 * The long road — one adventurer's whole story, in one place.
 *
 * Everything the game had was scattered by adventure: quests on one page,
 * encounters gone the moment they resolved, and "how it went" written
 * beautifully for exactly one evening at a time. A girl who had played five
 * adventures had no way to see that she had played five adventures.
 *
 * Per character rather than per account, deliberately. A household can hold
 * several adventurers over the years — a character handed on, a character
 * started again — and the trophies belong to whoever earned them, not to
 * whoever happens to be signed in.
 *
 * Written as sentences rather than a statistics table. The audience is nine,
 * and *"she found the brass key, green at the teeth"* is a thing to be proud
 * of in a way that `objectives_completed: 4` will never be.
 *
 * Anybody at your table can read anybody else's road — a bond and a deed are
 * shared facts, and hiding them from the other half of the pair would be
 * absurd. Somebody else's private aim is still hers; see `chronicleFor`.
 */
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // Anybody at your table, which is the same rule ties use. A guessed id from
  // outside 404s rather than admitting the adventurer exists.
  const allowed = await db.character.findFirst({
    where: { id, ...reachableCharacterWhere(user.id) },
    select: { id: true, race: true, archetype: true, pronouns: true },
  });
  if (!allowed) notFound();

  const road = await chronicleFor(id, user.id);
  if (!road) notFound();

  const them = pronounsOf(allowed.pronouns);
  const started = road.adventures.length;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow="The long road"
        title={road.name}
        lead={`${allowed.race} ${allowed.archetype} · level ${road.level}`}
      />

      <Link
        href={`/characters/${road.characterId}`}
        className="text-sm text-hearth-400 underline underline-offset-4 hover:text-hearth-200"
      >
        ← Back to {road.yours ? "the sheet" : `${road.name}'s sheet`}
      </Link>

      <div className="mt-8 space-y-6">
        {/* Four numbers, big. Everything else on this page is a sentence, and
            this is the part that reads at a glance from across a kitchen. */}
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure value={road.finished} label={road.finished === 1 ? "adventure finished" : "adventures finished"} />
            <Figure value={road.deeds.length} label={road.deeds.length === 1 ? "thing found" : "things found"} />
            <Figure value={road.people.length} label={road.people.length === 1 ? "person known" : "people known"} />
            <Figure
              value={road.rolls.best === null ? "—" : `+${road.rolls.best}`}
              label="best roll ever"
            />
          </div>

          {road.rolls.thrown > 0 ? (
            <p className="mt-4 text-sm text-hearth-400">
              {capitalise(them.subject)} {toHave(them.subject)} thrown {road.rolls.thrown}{" "}
              {road.rolls.thrown === 1 ? "check" : "checks"} and landed {road.rolls.landed} of them.
            </p>
          ) : null}
        </Card>

        {/* The road itself. Newest first — that is where she is standing. */}
        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">Where {them.subject} {toHave(them.subject)} been</h2>
          {started === 0 ? (
            <p className="text-sm text-hearth-400">
              No adventures yet. The road starts with the first one.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {road.adventures.map((adventure) => (
                <li key={adventure.campaignId ?? adventure.title} className="border-t border-hearth-800/50 pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {/* Only a link while there is still a journal to open. The
                        adventure can be deleted and the fact that she finished
                        it stays — see `RoadEntry`. */}
                    {adventure.campaignId ? (
                      <Link
                        href={`/campaigns/${adventure.campaignId}/journal`}
                        className="font-display text-lg text-hearth-100 underline-offset-4 hover:underline"
                      >
                        {adventure.title}
                      </Link>
                    ) : (
                      <span className="font-display text-lg text-hearth-100">{adventure.title}</span>
                    )}
                    <span className={`text-sm ${STATE_TONE[adventure.state]}`}>
                      {STATE_WORDS[adventure.state]}
                    </span>
                    {adventure.when ? (
                      <span className="text-sm text-hearth-500">
                        {adventure.when.toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                        })}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-0.5 text-sm text-hearth-400">{adventure.storyline}</p>

                  <p className="mt-2 text-sm text-hearth-300">
                    {[
                      adventure.chapters > 0
                        ? `${adventure.chapters} ${adventure.chapters === 1 ? "chapter" : "chapters"}`
                        : null,
                      adventure.errands > 0
                        ? `${adventure.errands} ${adventure.errands === 1 ? "errand" : "errands"}`
                        : null,
                      adventure.ownAims > 0
                        ? `${adventure.ownAims} of ${them.possessive} own`
                        : null,
                      adventure.rolls.thrown > 0
                        ? `${adventure.rolls.landed} of ${adventure.rolls.thrown} checks landed`
                        : null,
                      adventure.xpEarned > 0 ? `${adventure.xpEarned} experience` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Not much yet — it is early."}
                  </p>

                  {adventure.campaignId ? (
                    <Link
                      href={`/campaigns/${adventure.campaignId}/summary`}
                      className="mt-1 inline-block text-sm text-hearth-400 underline underline-offset-4 hover:text-hearth-200"
                    >
                      How it went
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm text-hearth-500">
                      This adventure is no longer written down anywhere but here.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* The proudest rows in the whole database, written once per turn and
            until now read by nobody. */}
        {road.deeds.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              What {them.subject} {toHave(them.subject)} found
            </h2>
            <p className="mb-4 text-sm text-hearth-400">
              Things {road.name} came back with, out of everything the party was looking for.
            </p>
            <ul className="space-y-2">
              {road.deeds.map((deed) => (
                <li key={deed.id} className="text-hearth-200">
                  {deed.item ?? deed.what}
                  <span className="block text-sm text-hearth-500">
                    {deed.quest} · {deed.adventure}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {road.standings.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              What {them.subject} {toHave(them.subject)} stood up to
            </h2>
            <p className="mb-4 text-sm text-hearth-400">
              Nothing here was fought. Every one of them wanted something.
            </p>
            <ul className="space-y-2">
              {road.standings.map((standing) => (
                <li key={standing.id} className="text-hearth-200">
                  {standing.name}
                  {standing.alone ? (
                    <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
                      alone
                    </span>
                  ) : null}
                  <span className="block text-sm text-hearth-500">
                    wanted {standing.want}
                    {standing.ending ? ` · ${ENDING_WORDS[standing.ending] ?? "settled"}` : ""} ·{" "}
                    {standing.adventure}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* The part nobody has ever been able to see. Every number here has
            been counted since the feature shipped and shown to no one. */}
        {road.together.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              Who {them.subject} {toHave(them.subject)}
            </h2>
            <p className="mb-4 text-sm text-hearth-400">
              Bonds grow when you help each other, and unlock moves you can only use together.
            </p>

            <ul className="space-y-4">
              {road.together.map((pair) => (
                <li
                  key={pair.otherId}
                  className="rounded-lg border border-hearth-800/60 bg-hearth-950/30 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-hearth-200">
                      {road.name} is the{" "}
                      <span className="text-hearth-100">{pair.tie}</span>{" "}
                      <Link
                        href={`/characters/${pair.otherId}/story`}
                        className="text-hearth-100 underline-offset-4 hover:underline"
                      >
                        {pair.otherName}
                      </Link>
                    </span>
                    <span className="text-sm text-hearth-400">
                      Bond {pair.bondLevel}
                      {pair.needed !== null ? (
                        <span className="text-hearth-500"> · {pair.into}/{pair.needed}</span>
                      ) : (
                        <span className="text-moss-400"> · as strong as it gets</span>
                      )}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-hearth-300">
                    {[
                      pair.adventuresShared > 0
                        ? `${pair.adventuresShared} ${pair.adventuresShared === 1 ? "adventure" : "adventures"} together`
                        : null,
                      pair.movesSpent > 0
                        ? `${pair.movesSpent} ${pair.movesSpent === 1 ? "move" : "moves"} spent`
                        : null,
                      pair.listened > 0
                        ? `${pair.listened} ${pair.listened === 1 ? "time" : "times"} one took up the other's idea`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Nothing spent together yet."}
                  </p>

                  {pair.moves.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {pair.moves.map((move) => (
                        <li
                          key={move}
                          className="rounded-full border border-moss-600/40 px-3 py-0.5 text-sm text-moss-300"
                        >
                          {move}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-hearth-500">
                      No moves yet — the first unlocks at bond 1.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {road.people.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              People {them.subject} {toHave(them.subject) === "has" ? "knows" : "know"}
            </h2>
            <p className="mb-4 text-sm text-hearth-400">
              Everyone {road.name} has met and might run into again.
            </p>
            <ul className="space-y-2">
              {road.people.map((person) => (
                <li key={person.id} className="text-hearth-200">
                  {person.name}
                  <span className="block text-sm text-hearth-500">
                    {person.about} · {person.metIn}
                    {person.timesMet > 1 ? ` · met ${person.timesMet} times` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {road.given.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">What it cost</h2>
            <p className="mb-4 text-sm text-hearth-400">
              Things {road.name} gave up, and what giving them up did.
            </p>
            <ul className="space-y-2">
              {road.given.map((keepsake) => (
                <li key={keepsake.id} className="text-hearth-200">
                  {keepsake.name}
                  <span className="block text-sm text-hearth-500">
                    {keepsake.note} · {keepsake.adventure}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {road.pictures.length > 0 ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">Pictures from the road</h2>
            <div className="flex flex-wrap gap-4">
              {road.pictures.map((picture) => (
                <Link
                  key={picture.id}
                  href={`/campaigns/${picture.campaignId}/pictures`}
                  className="w-28"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served
                      by an authenticated route, not by the image optimiser. */}
                  <img
                    src={`/api/campaigns/${picture.campaignId}/pictures/${picture.id}?v=${picture.version}`}
                    alt={picture.label}
                    className="h-28 w-28 rounded-lg border border-hearth-800 object-cover"
                  />
                  <span className="mt-1 block text-center text-sm text-hearth-400">
                    {picture.label}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

/** One big number and what it counts. */
function Figure({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl text-hearth-100">{value}</p>
      <p className="text-sm text-hearth-400">{label}</p>
    </div>
  );
}

const STATE_WORDS: Record<Chronicle["adventures"][number]["state"], string> = {
  FINISHED: "finished",
  GOING: "still going",
  // Never "abandoned". The story moved on, which is not the same as having lost.
  SET_ASIDE: "set aside",
};

const STATE_TONE: Record<Chronicle["adventures"][number]["state"], string> = {
  FINISHED: "text-moss-400",
  GOING: "text-amber-300/80",
  SET_ASIDE: "text-hearth-500",
};

/**
 * How an encounter ended, in words rather than an enum.
 *
 * `TURNED` is not written as a loss. The rule the whole encounter system is
 * built on is that nothing is defeated and nothing is fought — it turned, and
 * the story carried on from somewhere harder, which is a thing that happened
 * rather than a thing she failed at.
 */
const ENDING_WORDS: Record<string, string> = {
  THROUGH: "got through",
  TURNED: "it turned, and the story went on",
};
