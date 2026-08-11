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
import { kindFromPerspective, statPointsUnspent, type StatBlock } from "@/lib/game/rules";
import { Growth } from "@/components/character/growth";
import { KnackOffer, KnacksHeld } from "@/components/character/knacks";
import { knacksUnspent, offerFor } from "@/lib/game/knacks";
import { signatureFor } from "@/lib/game/character-options";
import { hasRequirement, lockedFor } from "@/lib/game/practice";

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
      keepsakes: {
        orderBy: { createdAt: "desc" },
        include: { campaign: { select: { id: true, title: true } } },
      },
      knacks: { orderBy: { createdAt: "asc" } },
      acquaintances: { orderBy: [{ timesMet: "desc" }, { updatedAt: "desc" }] },
      practices: { select: { key: true, attempts: true } },
    },
  });
  if (!character) notFound();

  const stats: StatBlock = {
    might: character.might,
    wits: character.wits,
    heart: character.heart,
    spark: character.spark,
  };
  const unspent = statPointsUnspent(stats, character.xp);
  const signature = signatureFor(character.archetype);

  // What levelling up has bought her, and what is still waiting to be spent.
  // The offer is a pure function of her own state, so it is the same three on
  // every page load — an offer that reshuffled on refresh would turn a decision
  // into a slot machine.
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

  // Your own adventurers, and anyone this one has actually travelled with.
  // The second half matters once a household hands each child their own
  // sign-in: "Wren is Mira's daughter" is then a tie between two accounts, and
  // the action has always allowed it — this is the list catching up.
  const others = await db.character.findMany({
    where: {
      id: { not: character.id },
      OR: [
        { userId: user.id },
        {
          partyMemberships: {
            some: { campaign: { party: { some: { characterId: character.id } } } },
          },
        },
      ],
    },
    select: { id: true, name: true, userId: true, user: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const relations: RelationRow[] = [
    ...character.relationshipsA.map((row) => ({
      id: row.id,
      otherId: row.characterB.id,
      otherName: row.characterB.name,
      kind: kindFromPerspective(row, character.id),
      bondXp: row.bondXp,
    })),
    ...character.relationshipsB.map((row) => ({
      id: row.id,
      otherId: row.characterA.id,
      otherName: row.characterA.name,
      kind: kindFromPerspective(row, character.id),
      bondXp: row.bondXp,
    })),
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle
        eyebrow={`Level ${character.level}`}
        title={character.name}
        lead={`${character.race} ${character.archetype} · ${character.pronouns}`}
      />

      <div className="mb-6">
        <Link href="/characters" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← All adventurers
        </Link>
      </div>

      <div className="space-y-6">
        {/* A knack waiting to be chosen goes above everything. It is the reason
            she opened her page, and it is the only thing here that will not
            still be true tomorrow if she ignores it. */}
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
            {unspent > 0 ? "She has grown" : "What she is like"}
          </h2>
          <Growth characterId={character.id} stats={stats} xp={character.xp} yours />

          {takenKnacks.length > 0 ? (
            <>
              <h3 className="mt-6 mb-2 text-sm font-medium tracking-wide text-hearth-400 uppercase">
                What she has picked up
              </h3>
              <KnacksHeld held={character.knacks} />
            </>
          ) : null}
        </Card>

        {/* Also shown for a character with neither yet: her calling's signature
            is the one thing on this card she has from the moment she is made. */}
        {signature || character.skills.length > 0 || character.inventory.length > 0 ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">What they can do</h2>

            {/* The one thing her calling alone can do. Listed first, because
                it is the only line on the sheet that is true of her and of
                nobody else at the table. */}
            {signature ? (
              <div className="mb-4 rounded-lg border border-hearth-700/50 bg-hearth-800/20 p-3">
                <p className="text-sm text-hearth-100">
                  {signature.name}
                  <span className="ml-2 text-xs tracking-wide text-hearth-400 uppercase">
                    {character.archetype} only
                  </span>
                </p>
                <p className="text-sm text-hearth-200/70">{signature.blurb}</p>
              </div>
            ) : null}

            {character.skills.length > 0 ? (
              <ul className="space-y-1">
                {character.skills.map((skill) => (
                  <li key={skill.id} className="text-sm text-hearth-200/80">
                    {skill.name}
                    <span className="ml-2 text-hearth-400">rank {skill.rank}</span>
                  </li>
                ))}
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
            <h2 className="font-display mb-1 text-xl text-hearth-100">People she knows</h2>
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
              stats: {
                might: character.might,
                wits: character.wits,
                heart: character.heart,
                spark: character.spark,
              },
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
    </main>
  );
}
