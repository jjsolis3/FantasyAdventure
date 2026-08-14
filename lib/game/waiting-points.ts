/**
 * The two things worth interrupting somebody for.
 *
 * A turn nobody has answered, and a point of growth nobody has spent. Both were
 * invisible from the characters list: a girl could be owed a level-up for three
 * weeks and the only way to find out was to open her sheet and notice the
 * spheres were lit.
 *
 * Since ties began needing the other household's agreement there is a third,
 * and it earns its place by the same test: a tie waiting on you is not a chore
 * to discover while playing, it is something that is silently earning nothing
 * until somebody presses a button. Nobody would ever go looking for it.
 *
 * Deliberately only these three. A list where everything is flagged is a list
 * where nothing is, and every other state — a quest half done, an item she
 * cannot use yet — is something to discover while playing.
 */

import { db } from "@/lib/db";
import { statPointsUnspent, type StatBlock } from "@/lib/game/rules";
import { knacksUnspent } from "@/lib/game/knacks";
import { skillPicksUnspent } from "@/lib/game/skill-offer";

export type WaitingPoint = { label: string; href: string };

export type CharacterState = {
  id: string;
  /** Which household answers for her, so her own proposals are not shown back. */
  userId: string;
  xp: number;
  stats: StatBlock;
  /** What she was built with, so growth is measured from the right place. */
  buildBudget: number;
  level: number;
  knackCount: number;
  /** Skills bought with a level-up pick, not earned by practising. */
  chosenSkillCount: number;
};

export async function waitingPointsFor(
  characters: CharacterState[],
): Promise<Map<string, WaitingPoint[]>> {
  const points = new Map<string, WaitingPoint[]>();
  if (characters.length === 0) return points;

  const ids = characters.map((character) => character.id);

  // One query for every adventurer at once. Per-character would be four or five
  // round trips on a page that is otherwise a single read.
  const owedTurns = await db.roundAnswer.findMany({
    where: {
      round: { status: "COLLECTING", campaign: { status: "ACTIVE" } },
      characterId: { in: ids },
    },
    select: { characterId: true, roundId: true },
  });
  const answered = new Set(owedTurns.map((answer) => `${answer.roundId}:${answer.characterId}`));

  const openRounds = await db.turnRound.findMany({
    where: {
      status: "COLLECTING",
      campaign: { status: "ACTIVE", party: { some: { characterId: { in: ids } } } },
    },
    select: { id: true, campaignId: true },
  });

  const memberships = await db.partyMember.findMany({
    where: { characterId: { in: ids }, campaign: { status: "ACTIVE" } },
    select: { characterId: true, campaignId: true },
  });

  // Ties somebody else proposed and this household has not answered. Both
  // directions of the stored pair, because which side a character landed on is
  // an artefact of sorting two ids.
  const unanswered = await db.relationship.findMany({
    where: {
      confirmedAt: null,
      OR: [{ characterAId: { in: ids } }, { characterBId: { in: ids } }],
    },
    select: { characterAId: true, characterBId: true, proposedById: true },
  });

  for (const character of characters) {
    const found: WaitingPoint[] = [];

    for (const membership of memberships.filter((m) => m.characterId === character.id)) {
      const round = openRounds.find((entry) => entry.campaignId === membership.campaignId);
      if (!round) continue;
      if (answered.has(`${round.id}:${character.id}`)) continue;

      found.push({
        label: "Your turn",
        href: `/campaigns/${membership.campaignId}/play`,
      });
      // One is enough. A girl in two adventures at once still only needs to be
      // told to go and play.
      break;
    }

    // Growth she has earned and not spent. Both kinds are shown as one pill,
    // because the destination is the same sheet either way.
    const statPoints = statPointsUnspent(character.stats, character.xp, character.buildBudget);
    const knacks = knacksUnspent(character.level, character.knackCount);
    const skills = skillPicksUnspent({
      level: character.level,
      chosen: character.chosenSkillCount,
    });

    if (statPoints > 0 || knacks > 0 || skills > 0) {
      const parts = [
        statPoints > 0 ? `${statPoints} to spend` : null,
        skills > 0 ? `${skills} skill${skills === 1 ? "" : "s"} to pick` : null,
        knacks > 0 ? `${knacks} knack${knacks === 1 ? "" : "s"} to choose` : null,
      ].filter(Boolean);
      found.push({ label: parts.join(" · "), href: `/characters/${character.id}` });
    }

    // Only when somebody else did the asking. Your own outstanding proposal is
    // on their list, not yours, and pestering you about it would be telling you
    // to wait for yourself.
    const toAnswer = unanswered.filter(
      (tie) =>
        (tie.characterAId === character.id || tie.characterBId === character.id) &&
        tie.proposedById !== character.userId,
    ).length;

    if (toAnswer > 0) {
      found.push({
        label: `${toAnswer} tie${toAnswer === 1 ? "" : "s"} to agree to`,
        href: `/characters/${character.id}`,
      });
    }

    if (found.length > 0) points.set(character.id, found);
  }

  return points;
}
