"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { membershipFor } from "@/lib/game/access";
import { CHOSEN_ROAD_KEY, chosenRoadNote, isForkChoice } from "@/lib/game/forks";
import type { FormState } from "@/lib/auth/actions";

/**
 * Taking one of the two roads.
 *
 * ## Anybody at the table, not only the host
 *
 * A fork is the one moment in an evening that belongs to the players rather
 * than to whoever set the adventure up, and routing it through the host would
 * hand it straight back. Anybody who can take a turn can take this.
 *
 * First press wins, deliberately, and the row records who. Two sisters reaching
 * for opposite buttons is the feature working — the argument is the point, and
 * it should happen before the click rather than be resolved by the database.
 *
 * ## How the next chapter finds out
 *
 * A memory, keyed so the newest road replaces the last. That is the one route
 * into the storyteller's context that needs no new plumbing, and it means the
 * choice reaches every prompt the next chapter builds rather than only the
 * first. Importance 5: a chapter that forgot which way the party went is worse
 * than one that forgot anything else.
 */
export async function chooseForkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const forkId = String(formData.get("forkId") ?? "");
  const choice = String(formData.get("choice") ?? "");
  if (!forkId || !isForkChoice(choice)) return { error: "That will not do." };

  const fork = await db.fork.findUnique({
    where: { id: forkId },
    include: { campaign: { select: { id: true, ownerId: true } } },
  });
  if (!fork) return { error: "That turning is not there any more." };

  const membership = await membershipFor(fork.campaign.id, user.id);
  if (!membership.isMember) {
    return { error: "You are not travelling in this adventure." };
  }

  // Already taken. Said plainly rather than silently succeeding, so a sister
  // who pressed second is told what happened rather than left thinking the
  // button is broken.
  if (fork.chosen) {
    return { error: "Somebody has already chosen which way to go." };
  }

  const taken =
    choice === "A"
      ? { where: fork.whereA, why: fork.whyA }
      : { where: fork.whereB, why: fork.whyB };

  await db.$transaction(async (tx) => {
    // Guarded on `chosen: null` so two people pressing at once cannot both
    // write. The loser's update matches nothing and the memory below is written
    // once, for the road that actually won.
    const claimed = await tx.fork.updateMany({
      where: { id: fork.id, chosen: null },
      data: { chosen: choice, chosenAt: new Date(), chosenById: user.id },
    });
    if (claimed.count === 0) return;

    await tx.memory.upsert({
      where: {
        campaignId_kind_key: {
          campaignId: fork.campaign.id,
          kind: "PLOT_THREAD",
          key: CHOSEN_ROAD_KEY,
        },
      },
      create: {
        campaignId: fork.campaign.id,
        kind: "PLOT_THREAD",
        key: CHOSEN_ROAD_KEY,
        content: chosenRoadNote(taken),
        importance: 5,
        lastSeenAt: 0,
      },
      update: { content: chosenRoadNote(taken), importance: 5 },
    });
  });

  revalidatePath(`/campaigns/${fork.campaign.id}/play`);
  revalidatePath(`/campaigns/${fork.campaign.id}`);
  return { error: "" };
}
