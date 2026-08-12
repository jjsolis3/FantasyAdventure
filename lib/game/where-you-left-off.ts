/**
 * What is actually waiting for you.
 *
 * The front page has always been a brochure: a welcome, two links, and the
 * library of storylines. That is exactly right for somebody who has never
 * played and wrong for everybody else — a family three chapters into an
 * adventure opens it and is offered a catalogue.
 *
 * So the same page leads with whatever is in progress, and the catalogue moves
 * below. Signed out, nothing here runs and the brochure is all there is.
 */

import { db } from "@/lib/db";
import { memberCampaignWhere } from "@/lib/game/access";
import { currentRound } from "@/lib/game/rounds";

export type Waiting =
  /** Built, but nobody has begun. */
  | { kind: "NOT_STARTED" }
  /** Somebody in this household owes the round an answer. */
  | { kind: "YOUR_TURN"; who: string[] }
  /** Everyone here has answered; the round is waiting on another household. */
  | { kind: "WAITING_ON_OTHERS"; count: number }
  /** One screen, so there is nothing to wait for — somebody just picks it up. */
  | { kind: "CARRY_ON" }
  /** Finished, and worth saying so. */
  | { kind: "FINISHED" };

export type InProgress = {
  id: string;
  title: string;
  storyline: string;
  actIndex: number;
  actCount: number;
  /** Where the party got to, so the card can say more than a chapter number. */
  sceneTitle: string | null;
  party: { name: string; portraitVersion: number | null }[];
  waiting: Waiting;
};

/**
 * The adventures this account is part of, most recently touched first.
 *
 * Finished ones are included, but only the most recent — an account with nine
 * completed stories does not want its front page to be a filing cabinet, and
 * the one it just finished is worth a link to the summary.
 */
export async function whereYouLeftOff(userId: string): Promise<InProgress[]> {
  const campaigns = await db.campaign.findMany({
    where: { ...memberCampaignWhere(userId), status: { in: ["SETUP", "ACTIVE", "COMPLETE"] } },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select: {
      id: true,
      title: true,
      status: true,
      inputMode: true,
      currentActIndex: true,
      storyline: { select: { title: true, acts: { select: { id: true } } } },
      scenes: {
        where: { status: "OPEN" },
        orderBy: { index: "desc" },
        take: 1,
        select: { title: true },
      },
      party: {
        select: {
          characterId: true,
          character: {
            select: { name: true, userId: true, portrait: { select: { version: true } } },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });

  const inProgress: InProgress[] = [];

  for (const campaign of campaigns) {
    // Only asked for the adventures that could be waiting on somebody. A round
    // lookup per campaign is cheap, but doing it for a finished story would be
    // a query whose answer is never read.
    const round =
      campaign.status === "ACTIVE" && campaign.inputMode === "OWN_DEVICE"
        ? await currentRound(campaign.id)
        : null;

    inProgress.push({
      id: campaign.id,
      title: campaign.title,
      storyline: campaign.storyline.title,
      actIndex: campaign.currentActIndex,
      actCount: campaign.storyline.acts.length,
      sceneTitle: campaign.scenes[0]?.title ?? null,
      party: campaign.party.map((member) => ({
        name: member.character.name,
        portraitVersion: member.character.portrait?.version ?? null,
      })),
      waiting: waitingFor(campaign, round, userId),
    });
  }

  return inProgress;
}

type RoundRow = Awaited<ReturnType<typeof currentRound>>;

/** Exactly what the decision below needs, and nothing else. */
type CampaignRow = {
  status: string;
  party: { characterId: string; character: { name: string; userId: string } }[];
};

/**
 * The one sentence a card exists to say.
 *
 * Ordered by what a person most needs to know: finished, then not started, then
 * whether it is on *them*. "Waiting on somebody else" is the least urgent thing
 * on this list and is last for that reason.
 */
function waitingFor(campaign: CampaignRow, round: RoundRow, userId: string): Waiting {
  if (campaign.status === "COMPLETE") return { kind: "FINISHED" };
  if (campaign.status === "SETUP") return { kind: "NOT_STARTED" };
  if (!round || round.status !== "COLLECTING") return { kind: "CARRY_ON" };

  const answered = new Set(round.answers.map((answer) => answer.characterId));
  const yours = campaign.party.filter((member) => member.character.userId === userId);

  const owed = yours
    .filter((member) => !answered.has(member.characterId))
    .map((member) => member.character.name);
  if (owed.length > 0) return { kind: "YOUR_TURN", who: owed };

  const stillOut = campaign.party.filter((member) => !answered.has(member.characterId)).length;
  return stillOut > 0 ? { kind: "WAITING_ON_OTHERS", count: stillOut } : { kind: "CARRY_ON" };
}
