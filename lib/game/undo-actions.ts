"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { undoLastTurn } from "@/lib/engine/undo";
import type { FormState } from "@/lib/auth/actions";

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
