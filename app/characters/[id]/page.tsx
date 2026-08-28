import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { CharacterForm } from "@/components/character/character-form";
import { DeleteCharacter } from "@/components/character/delete-character";
import { PortraitUpload } from "@/components/character/portrait-upload";
import { Handover } from "@/components/character/handover";
import { RelationshipEditor, type RelationRow } from "@/components/character/relationship-editor";
import { pendingFor, reachableCharacterWhere } from "@/lib/game/ties";
import {
  kindFromPerspective,
  nextSkillLevel,
  statPointsUnspent,
  statsOf,
  type StatBlock,
} from "@/lib/game/rules";
import { Growth } from "@/components/character/growth";
import { Dream } from "@/components/character/dream";
import { KnackOffer, KnacksHeld } from "@/components/character/knacks";
import { knacksUnspent, offerFor } from "@/lib/game/knacks";
import { SkillOffer } from "@/components/character/skill-offer";
import {
  browsableSkills,
  reasonFor,
  skillPicksUnspent,
  suggestedSkills,
} from "@/lib/game/skill-offer";
import { signaturesFor } from "@/lib/game/character-options";
import { abilitiesFor, hasRequirement, lockedFor } from "@/lib/game/practice";
import { capitalise, pronounsOf, toBe, toHave } from "@/lib/game/pronouns";
import { lookOf, lookSentence } from "@/lib/game/wardrobe";
import { characterPicture } from "@/lib/game/character-picture";
import { Face } from "@/components/character/face";

export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // Scoped by userId, so a guessed id from another household 404s rather than
  // leaking that the character exists.
  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    include: {
      skills: { orderBy: { name: "asc" } },
      inventory: { orderBy: { name: "asc" } },
      relationshipsA: { include: { characterB: { select: { id: true, name: true } } } },
      relationshipsB: { include: { characterA: { select: { id: true, name: true } } } },
      // Only so that removing them can say which stories they would leave.
      partyMemberships: {
        include: { campaign: { select: { id: true, title: true, status: true } } },
      },
      portrait: { select: { version: true } },
      art: { select: { version: true, lookKey: true } },
      keepsakes: {
        orderBy: { createdAt: "desc" },
        include: { campaign: { select: { id: true, title: true } } },
      },
      knacks: { orderBy: { createdAt: "asc" } },
      acquaintances: { orderBy: [{ timesMet: "desc" }, { updatedAt: "desc" }] },
      practices: { select: { key: true, label: true, attempts: true } },
      // Newest echo last, so the trail reads in the order it happened. Answered
      // wishes come back too — a shelf of them is the strongest argument there
      // is for writing down another.
      dreams: {
        orderBy: { createdAt: "desc" },
        include: { echoes: { orderBy: { atTurn: "asc" } } },
      },
    },
  });
  if (!character) notFound();

  // One at a time — see `DREAMS_AT_ONCE`. Set-aside ones stay in the row but
  // never come back to the page; what she wanted at nine is kept, not shown.
  const activeDream = character.dreams.find((entry) => entry.status === "ACTIVE") ?? null;

  const stats: StatBlock = statsOf(character);
  // The same sentence the storyteller is given and the drawing model is asked
  // for. Three surfaces, one function — a portrait that does not match the
  // sheet is worse than no portrait.
  const look = lookSentence(lookOf(character));
  const unspent = statPointsUnspent(stats, character.xp, character.buildBudget);
  const signatures = signaturesFor(character.archetype, character.level);
  // Named on the sheet before she has it, because a thing you are working
  // towards is worth more than a thing that appears without warning.
  const stillToCome = signaturesFor(character.archetype).filter(
    (signature) => signature.fromLevel > character.level,
  );

  // Pronouns have always been stored and always been handed to the storyteller,
  // which is why the story got them right and these headings did not.
  const them = pronounsOf(character.pronouns);

  // What levelling up has bought her, and what is still waiting to be spent.
  // The offer is a pure function of her own state, so it is the same three on
  // every page load — an offer that reshuffled on refresh would turn a decision
  // into a slot machine.
  // The same idea for skills, and the reason both exist: a knack is a privilege
  // the game picks three of, a skill is a thing she decides to be good at. One
  // is being noticed; the other is having a plan.
  const skillInput = {
    archetype: character.archetype,
    level: character.level,
    held: character.skills.map((skill) => skill.name),
    chosen: character.skills.filter((skill) => skill.chosenAtLevel !== null).length,
    practices: character.practices,
  };
  const skillsWaiting = skillPicksUnspent(skillInput);
  const nextSkill = nextSkillLevel(character.level, skillInput.chosen);

  const takenKnacks = character.knacks.map((knack) => knack.key);
  const knacksWaiting = knacksUnspent(character.level, takenKnacks.length);
  const offered = knacksWaiting > 0
    ? offerFor({
        characterId: character.id,
        level: character.level,
        stats,
        practices: character.practices,
        taken: takenKnacks,
      })
    : [];

  // Grouped by adventure, newest first, which is the order she would tell you
  // about them in. An adventure that has since been deleted keeps its
  // keepsakes — the thing still happened to her — so they gather under one
  // honest heading rather than disappearing.
  const shelf: { campaignId: string | null; title: string; keepsakes: typeof character.keepsakes }[] =
    [];
  for (const keepsake of character.keepsakes) {
    const campaignId = keepsake.campaign?.id ?? null;
    const existing = shelf.find((group) => group.campaignId === campaignId);
    if (existing) {
      existing.keepsakes.push(keepsake);
    } else {
      shelf.push({
        campaignId,
        title: keepsake.campaign?.title ?? "An adventure since forgotten",
        keepsakes: [keepsake],
      });
    }
  }

  // Everybody at your table — see `reachableCharacterWhere`. Scoped to the
  // table rather than to this character, and that distinction is the whole bug
  // it fixes: a newly made adventurer has travelled with nobody, so the old
  // rule offered an empty list at exactly the moment a family most wants to say
  // who he is. A father who has handed his old character to his daughters, and
  // made a new one, can now say he is their father.
  const others = await db.character.findMany({
    where: { id: { not: character.id }, ...reachableCharacterWhere(user.id) },
    select: { id: true, name: true, userId: true, user: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Unconfirmed ties are included here and nowhere else. This page is where a
  // proposal is answered, so it is the one place that has to show one.
  const relations: RelationRow[] = [
    ...character.relationshipsA.map((row) => ({
      id: row.id,
      otherId: row.characterB.id,
      otherName: row.characterB.name,
      kind: kindFromPerspective(row, character.id),
      bondXp: row.bondXp,
      waitingOn: pendingFor(row, user.id),
    })),
    ...character.relationshipsB.map((row) => ({
      id: row.id,
      otherId: row.characterA.id,
      otherName: row.characterA.name,
      kind: kindFromPerspective(row, character.id),
      bondXp: row.bondXp,
      waitingOn: pendingFor(row, user.id),
    })),
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-2">
        <Face
          picture={characterPicture({
            id: character.id,
            name: character.name,
            look: lookOf(character),
            portraitVersion: character.portrait?.version ?? null,
            art: character.art,
          })}
          name={character.name}
          size={72}
        />
      </div>
      <PageTitle
        eyebrow={`Level ${character.level}`}
        title={character.name}
        lead={`${character.race} ${character.archetype} · ${character.pronouns}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/characters" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← All adventurers
        </Link>
        {/* The sheet is who she is now; the road is everything she has done.
            Kept apart on purpose — a page that is both is a page a child
            scrolls past looking for the buttons. */}
        <Link
          href={`/characters/${character.id}/story`}
          className="text-sm text-hearth-300 underline hover:text-hearth-200"
        >
          The long road →
        </Link>
      </div>

      <div className="space-y-6">
        {/* A knack waiting to be chosen goes above everything. It is the reason
            she opened her page, and it is the only thing here that will not
            still be true tomorrow if she ignores it. */}
        {skillsWaiting > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              Something new to be good at
            </h2>
            <SkillOffer
              characterId={character.id}
              suggestions={suggestedSkills(skillInput).map((skill) => ({
                skill,
                reason: reasonFor(skill, skillInput),
              }))}
              browsable={browsableSkills(skillInput)}
              unspent={skillsWaiting}
            />
          </Card>
        ) : null}

        {/* Above the numbers, and that is the right order for the audience.
            A nine-year-old opening her adventurer's page is not coming for the
            stat allocator, and the one screen in the game that is pure pleasure
            should not be the hardest to find. */}
        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">How they look</h2>
          {look ? (
            <p className="mb-3 text-hearth-200">{look}</p>
          ) : (
            <p className="mb-3 text-sm text-hearth-400">
              Nothing chosen yet. Pick a cloak, a colour and something they would be remembered by.
            </p>
          )}
          <Link
            href={`/characters/${character.id}/look`}
            className="inline-block rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
          >
            {look ? "Change how they look" : "Dress them"}
          </Link>
        </Card>

        {/* High on the page, and above the numbers, because it is the answer to
            "why am I playing" — and burying that under seven stats would say
            the opposite of what it is for. */}
        <Dream
          characterId={character.id}
          name={character.name}
          pronouns={character.pronouns}
          yours
          dream={
            activeDream
              ? {
                  id: activeDream.id,
                  wish: activeDream.wish,
                  echoes: activeDream.echoes.map((echo) => ({
                    id: echo.id,
                    note: echo.note,
                    campaignTitle: echo.campaignTitle,
                  })),
                }
              : null
          }
          answered={character.dreams
            .filter((entry) => entry.status === "ANSWERED")
            .map((entry) => ({
              id: entry.id,
              wish: entry.wish,
              answeredNote: entry.answeredNote,
              answeredInCampaignTitle: entry.answeredInCampaignTitle,
            }))}
          currentCampaignId={
            character.partyMemberships.find((member) => member.campaign.status === "ACTIVE")
              ?.campaign.id
          }
        />

        {offered.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              Something new
            </h2>
            <KnackOffer characterId={character.id} offered={offered} unspent={knacksWaiting} />
          </Card>
        ) : null}

        {/* Growth next, because when there is a point waiting to be spent this
            is the reason she opened her own page. */}
        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">
            {unspent > 0
              ? `${capitalise(them.subject)} ${toHave(them.subject)} grown`
              : `What ${them.subject} ${toBe(them.subject)} like`}
          </h2>
          <Growth
            characterId={character.id}
            stats={stats}
            xp={character.xp}
            builtWith={character.buildBudget}
            yours
          />

          {/* When the next choice arrives. Slowing the ladder makes "nothing
              waiting" the normal state, and an absence with no explanation
              reads as the game having forgotten her — so it says when. */}
          {skillsWaiting === 0 && nextSkill !== null ? (
            <p className="mt-3 text-sm text-hearth-400">
              {nextSkill > character.level
                ? `Something new to be good at at level ${nextSkill}.`
                : "Something new to be good at is waiting."}
            </p>
          ) : null}

          {takenKnacks.length > 0 ? (
            <>
              <h3 className="mt-6 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                What {them.subject} {toHave(them.subject)} picked up
              </h3>
              <KnacksHeld held={character.knacks} />
            </>
          ) : null}
        </Card>

        {/* Also shown for a character with neither yet: her calling's signature
            is the one thing on this card she has from the moment she is made. */}
        {signatures.length > 0 || character.skills.length > 0 || character.inventory.length > 0 ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">What they can do</h2>

            {/* The one thing her calling alone can do. Listed first, because
                it is the only line on the sheet that is true of her and of
                nobody else at the table. */}
            {signatures.map((signature) => (
              <div
                key={signature.name}
                className="mb-4 rounded-lg border border-hearth-700/50 bg-hearth-800/20 p-3"
              >
                <p className="text-sm text-hearth-100">
                  {signature.name}
                  <span className="ml-2 text-xs tracking-wide text-hearth-400 uppercase">
                    {character.archetype} only
                  </span>
                </p>
                <p className="text-sm text-hearth-200/70">{signature.blurb}</p>
              </div>
            ))}

            {/* What is still to come. A calling used to be finished the moment
                it was picked; saying the second one is waiting at level five is
                the whole reason it was worth adding. */}
            {stillToCome.length > 0 ? (
              <div className="mb-4 rounded-lg border border-dashed border-hearth-800 p-3">
                {stillToCome.map((signature) => (
                  <p key={signature.name} className="text-sm text-hearth-400">
                    <span className="text-hearth-300">{signature.name}</span> — at level{" "}
                    {signature.fromLevel}. {signature.blurb}
                  </p>
                ))}
              </div>
            ) : null}

            {character.skills.length > 0 ? (
              <ul className="space-y-2">
                {character.skills.map((skill) => {
                  // A rank used to be a number that made a die friendlier. What
                  // it actually buys her is listed underneath, so improving a
                  // skill is something she can see the shape of before she
                  // gets there.
                  const abilities = abilitiesFor({ name: skill.name, rank: skill.rank });

                  return (
                    <li key={skill.id} className="text-sm text-hearth-200/80">
                      {skill.name}
                      <span className="ml-2 text-hearth-400">rank {skill.rank}</span>

                      {abilities.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 pl-4">
                          {abilities.map((ability) => (
                            <li key={ability.name} className="text-sm text-hearth-200/60">
                              <span className="text-hearth-300">{ability.name}</span> —{" "}
                              {ability.blurb}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {character.inventory.length > 0 ? (
              <>
                <h3 className="mt-5 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                  Carrying
                </h3>
                <ul className="space-y-1">
                  {character.inventory.map((item) => {
                    // Something she has not grown into yet says so plainly, and
                    // says what would change it. A locked thing is only worth
                    // carrying if you can see what it is waiting for.
                    const lock = hasRequirement(item)
                      ? lockedFor(item, { level: character.level, skills: character.skills })
                      : { locked: false as const };

                    return (
                      <li key={item.id} className="text-sm text-hearth-200/80">
                        {item.name}
                        {item.quantity > 1 ? <span className="text-hearth-400"> ×{item.quantity}</span> : null}
                        {item.description ? (
                          <span className="text-hearth-400"> — {item.description}</span>
                        ) : null}
                        {lock.locked ? (
                          <span className="block text-hearth-500">
                            You cannot use this yet — it needs {lock.needs}.
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

          </Card>
        ) : null}

        {/* Who she knows. Empty until a family has finished an adventure, and
            then the quiet proof that being kind to somebody was worth it —
            they are still out there, and they remember her. */}
        {character.acquaintances.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">
              People {them.subject} {toHave(them.subject)=== "has" ? "knows" : "know"}
            </h2>
            <p className="mb-4 text-sm text-hearth-400">
              Everyone {character.name} has met and might run into again.
            </p>
            <ul className="space-y-2">
              {character.acquaintances.map((person) => (
                <li key={person.id} className="rounded-lg border border-hearth-800/50 p-3">
                  <p className="text-sm text-hearth-100">
                    {person.name}
                    {person.timesMet > 1 ? (
                      <span className="ml-2 text-xs tracking-wide text-hearth-400 uppercase">
                        {person.timesMet} adventures
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-hearth-200/70">{person.about}</p>
                  <p className="mt-0.5 text-sm text-hearth-500">
                    Met on {person.metInCampaignTitle}.
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* The shelf: everything this adventurer has ever given up, across
            every story she has been in. Its own card rather than a footnote
            under what she can do, because this is the one part of the sheet
            that is purely a record of what she has done — and the reason a
            child comes back to look at their own page. */}
        {shelf.length > 0 ? (
          <Card>
            <h2 className="font-display mb-1 text-xl text-hearth-100">The shelf</h2>
            <p className="mb-5 text-sm text-hearth-400">
              Things {character.name} gave up to finish something, and what each one bought.
            </p>

            <div className="space-y-5">
              {shelf.map((group) => (
                <div key={group.campaignId ?? "forgotten"}>
                  <h3 className="mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                    {group.title}
                  </h3>
                  <ul className="space-y-1">
                    {group.keepsakes.map((keepsake) => (
                      <li key={keepsake.id} className="text-sm text-hearth-200/80">
                        {keepsake.name}
                        <span className="text-hearth-400"> — {keepsake.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card>
          <h2 className="font-display mb-5 text-xl text-hearth-100">Family ties</h2>
          <RelationshipEditor
            characterId={character.id}
            characterName={character.name}
            relations={relations}
            others={others.map((other) => ({
              id: other.id,
              name: other.name,
              playedBy: other.userId === user.id ? null : other.user.displayName,
            }))}
          />
        </Card>

        {/* Everything below is housekeeping rather than the character, and it
            was making a sheet somebody opens to look at their adventurer three
            screens long. Folded away: still one click, but the page now ends
            with who she is rather than with a delete button. */}
        <details className="rounded-xl border border-hearth-800/60 bg-hearth-900/20">
          <summary className="cursor-pointer px-5 py-4 text-sm text-hearth-300 hover:text-hearth-200">
            Change {them.possessive} details, portrait, or who plays {them.object}
          </summary>
          <div className="space-y-6 p-5 pt-0">
        <Card>
            <h2 className="font-display mb-5 text-xl text-hearth-100">Edit</h2>
            <CharacterForm
              mode="edit"
              initial={{
                id: character.id,
                name: character.name,
                race: character.race,
                archetype: character.archetype,
                gender: character.gender ?? "",
                pronouns: character.pronouns,
                ageBand: character.ageBand,
                description: character.description ?? "",
                stats: statsOf(character),
                skills: character.skills.map((skill) => skill.name),
              }}
            />
          </Card>

          <Card>
            <h2 className="font-display mb-3 text-xl text-hearth-100">Portrait</h2>
            <PortraitUpload
              characterId={character.id}
              characterName={character.name}
              version={character.portrait?.version ?? null}
            />
          </Card>

          <Card>
            <h2 id="hand-over" className="font-display mb-3 scroll-mt-6 text-xl text-hearth-100">
              Hand over
            </h2>
            <Handover
              characterId={character.id}
              characterName={character.name}
              code={character.handoverCode}
            />
          </Card>

          <Card className="border-red-900/40">
            <h2 className="font-display mb-2 text-xl text-hearth-100">Remove</h2>
            <DeleteCharacter
              characterId={character.id}
              characterName={character.name}
              loss={{
                level: character.level,
                xp: character.xp,
                skills: character.skills.length,
                items: character.inventory.length,
                ties: relations.length,
                adventures: character.partyMemberships.map((member) => ({
                  id: member.campaign.id,
                  title: member.campaign.title,
                  finished: member.campaign.status === "COMPLETE",
                })),
              }}
            />
          </Card>
          </div>
        </details>

      </div>
    </main>
  );
}
