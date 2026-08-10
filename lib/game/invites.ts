/**
 * Who you can ask along, and what you have been asked to.
 *
 * The join code answers "somebody is standing next to me". This answers the
 * other case, which turned out to be the common one: a household where every
 * player has their own sign-in and one character each, trying to start an
 * adventure that needs two. Nobody could — the party picker only ever offered
 * your own adventurers, so the minimum was unreachable no matter how many
 * people were playing.
 *
 * The rule for who is offered is deliberately generous. Registration is
 * invite-only, so everyone with an account was let in by somebody here; there
 * is no stranger to protect anyone from. Family ties come first because that is
 * who you are most likely to be playing with, but a brand-new adventurer with
 * no ties yet is still listed — the first character a child makes has no
 * relationships at all, and being invisible would be exactly the problem this
 * exists to fix.
 */

import { db } from "@/lib/db";
import { kindFromPerspective, RELATIONSHIP_LABELS, type RelationshipKind } from "@/lib/game/rules";

export type InviteCandidate = {
  id: string;
  name: string;
  race: string;
  archetype: string;
  /** Who answers for them, so the person inviting knows where it is going. */
  playedBy: string;
  /** "sibling of Bramble", or null when there is no tie yet. */
  tie: string | null;
  /** Family ties sort first; within that, the strongest bond leads. */
  bondLevel: number;
};

type OtherCharacter = {
  id: string;
  name: string;
  race: string;
  archetype: string;
  playedBy: string;
};

type TieRow = {
  characterAId: string;
  characterBId: string;
  aToB: RelationshipKind;
  bondLevel: number;
};

/**
 * Turns raw rows into the offered list. Separated from the queries so the
 * ordering — the part with the actual judgement in it — can be tested.
 */
export function rankCandidates(
  mine: { id: string; name: string }[],
  others: OtherCharacter[],
  ties: TieRow[],
): InviteCandidate[] {
  const mineById = new Map(mine.map((character) => [character.id, character.name]));

  const tieByOther = new Map<string, { label: string; bondLevel: number }>();
  for (const tie of ties) {
    const isMineA = mineById.has(tie.characterAId);
    const isMineB = mineById.has(tie.characterBId);
    // A tie between two of your own adventurers says nothing about who to
    // invite, and neither does one between two other households.
    if (isMineA === isMineB) continue;

    const mineId = isMineA ? tie.characterAId : tie.characterBId;
    const otherId = isMineA ? tie.characterBId : tie.characterAId;
    // From the candidate's side, so the label reads as a description of them:
    // "child of Bramble", not "parent of Bramble" for the same stored row.
    const kind = kindFromPerspective(tie, otherId);

    // Several of your adventurers may know the same person; keep the closest.
    const existing = tieByOther.get(otherId);
    if (existing && existing.bondLevel >= tie.bondLevel) continue;

    tieByOther.set(otherId, {
      label: `${RELATIONSHIP_LABELS[kind]} ${mineById.get(mineId) ?? "yours"}`,
      bondLevel: tie.bondLevel,
    });
  }

  return others
    .map((character) => {
      const tie = tieByOther.get(character.id);
      return { ...character, tie: tie?.label ?? null, bondLevel: tie?.bondLevel ?? 0 };
    })
    .sort((a, b) => {
      if ((a.tie === null) !== (b.tie === null)) return a.tie === null ? 1 : -1;
      if (a.bondLevel !== b.bondLevel) return b.bondLevel - a.bondLevel;
      return a.name.localeCompare(b.name);
    });
}

/** Everybody else's adventurers, ordered by how likely you are to want them. */
export async function invitableCharacters(
  userId: string,
  options: { exclude?: string[] } = {},
): Promise<InviteCandidate[]> {
  const excluded = new Set(options.exclude ?? []);

  const [mine, others] = await Promise.all([
    db.character.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.character.findMany({
      where: { userId: { not: userId }, id: { notIn: [...excluded] } },
      select: {
        id: true,
        name: true,
        race: true,
        archetype: true,
        user: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Ties in either direction, from any of your adventurers to anyone else's.
  // One query rather than one per character.
  const ties =
    mine.length === 0
      ? []
      : await db.relationship.findMany({
          where: {
            OR: [
              { characterAId: { in: mine.map((character) => character.id) } },
              { characterBId: { in: mine.map((character) => character.id) } },
            ],
          },
          select: { characterAId: true, characterBId: true, aToB: true, bondLevel: true },
        });

  return rankCandidates(
    mine,
    others.map((character) => ({
      id: character.id,
      name: character.name,
      race: character.race,
      archetype: character.archetype,
      playedBy: character.user.displayName,
    })),
    ties as TieRow[],
  );
}

export type PendingInvite = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  storylineTitle: string;
  invitedBy: string;
  characterId: string;
  characterName: string;
  /** True once the adventure it belongs to is no longer taking anyone new. */
  stale: boolean;
};

/** Invitations waiting on this account, for the adventures list to show. */
export async function pendingInvitesFor(userId: string): Promise<PendingInvite[]> {
  const invites = await db.partyInvite.findMany({
    where: { status: "PENDING", character: { userId } },
    include: {
      character: { select: { id: true, name: true } },
      invitedBy: { select: { displayName: true } },
      campaign: {
        select: { id: true, title: true, status: true, storyline: { select: { title: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return invites.map((invite) => ({
    id: invite.id,
    campaignId: invite.campaign.id,
    campaignTitle: invite.campaign.title,
    storylineTitle: invite.campaign.storyline.title,
    invitedBy: invite.invitedBy.displayName,
    characterId: invite.character.id,
    characterName: invite.character.name,
    stale: invite.campaign.status === "COMPLETE",
  }));
}
