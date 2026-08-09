"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { undoLastTurn } from "@/lib/engine/undo";
import { markStoppingPoint } from "@/lib/engine/play";
import { openRound } from "@/lib/game/rounds";
import type { FormState } from "@/lib/auth/actions";

export type UndoOutcome =
  | { ok: true; actions: { characterId: string; text: string }[] }
  | { ok: false; error: string };

/**
 * Takes back the most recent turn.
 *
 * Ownership is enforced inside undoLastTurn rather than here, because that is
 * where the deletes happen and a check that lives away from the writes is one
 * refactor from being skipped.
 */
export async function undoLastTurnAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) return { error: "Which adventure?" };

  const result = await undoLastTurn(campaignId, user.id);
  if (!result.ok) return { error: result.reason };

  revalidatePath(`/campaigns/${campaignId}/play`);
  revalidatePath(`/campaigns/${campaignId}`);
  return { error: "" };
}

/**
 * Takes the turn back and hands its words back to the caller.
 *
 * Used by "the storyteller got that wrong": the turn is removed, but what
 * everyone said is restored into the boxes so only the correction has to be
 * typed.
 */
export async function retellLastTurnAction(campaignId: string): Promise<UndoOutcome> {
  const user = await requireUser();
  const result = await undoLastTurn(campaignId, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  // On a shared screen the words go back into the boxes on the page that asked.
  // Apart, they have to go somewhere the rest of the party can see them too, so
  // the retelling opens as a round with everybody's answer already in it —
  // marked as a retelling, so it waits to be sent rather than starting itself.
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { inputMode: true },
  });
  if (campaign?.inputMode === "OWN_DEVICE") {
    await openRound(campaignId, "ACTION", { retelling: true, seed: result.actions });
  }

  revalidatePath(`/campaigns/${campaignId}/play`);
  return { ok: true, actions: result.actions };
}

/** Records where a play session stopped, so next time can pick it up. */
export async function markStoppingPointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) return { error: "Which adventure?" };

  try {
    await markStoppingPoint(campaignId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not mark the spot." };
  }

  revalidatePath(`/campaigns/${campaignId}/play`);
  return { error: "" };
}
