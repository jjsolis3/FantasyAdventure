"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, isUniqueViolation } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { generateHandoverCode, normaliseInviteCode } from "@/lib/auth/invite-code";
import type { FormState } from "@/lib/auth/actions";

/**
 * Handing an adventurer to the player who is actually playing them.
 *
 * Most families build the whole party from one account, because one adult was
 * holding the keyboard. Giving everybody their own sign-in afterwards must not
 * mean rebuilding those characters: a rebuilt character is a level 1 character
 * with nothing in their pockets and no bonds, which is a worse answer than
 * never having separate sign-ins at all.
 *
 * So the adventurer moves rather than being copied. Everything they have earned
 * — experience, skill ranks, what they are carrying, their family ties and the
 * bond levels in them, and their place in every party — is stored against the
 * character, so a handover changes one column and loses nothing.
 */

/** Offers the adventurer, returning a code for whoever is taking them on. */
export async function offerCharacterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const characterId = String(formData.get("characterId") ?? "");
  if (!characterId) return { error: "Which adventurer?" };

  for (let attempt = 0; ; attempt += 1) {
    try {
      const offered = await db.character.updateMany({
        where: { id: characterId, userId: user.id },
        data: { handoverCode: generateHandoverCode() },
      });
      if (offered.count === 0) return { error: "Adventurer not found." };
      break;
    } catch (error) {
      if (attempt >= 4 || !isUniqueViolation(error)) throw error;
    }
  }

  revalidatePath(`/characters/${characterId}`);
  return { error: "" };
}

/** Withdraws the offer, so a code read out to the wrong person stops working. */
export async function cancelHandoverAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const characterId = String(formData.get("characterId") ?? "");
  if (!characterId) return;

  await db.character.updateMany({
    where: { id: characterId, userId: user.id },
    data: { handoverCode: null },
  });

  revalidatePath(`/characters/${characterId}`);
}

const claimSchema = z.object({ code: z.string().trim().min(1, "Type the code you were given.") });

/**
 * Takes the adventurer on.
 *
 * The move is conditional on the code still being the one that was offered, so
 * two people racing to claim the same adventurer cannot both succeed — the
 * second finds the code already spent and is told so.
 */
export async function claimCharacterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = claimSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { code: parsed.error.issues[0]?.message ?? "Type the code you were given." },
    };
  }

  const code = normaliseInviteCode(parsed.data.code);
  const character = await db.character.findUnique({
    where: { handoverCode: code },
    select: { id: true, name: true, userId: true },
  });
  if (!character) {
    return { error: "That code does not match any adventurer. Check it and try again." };
  }
  if (character.userId === user.id) {
    return { error: `${character.name} is already yours.` };
  }

  const claimed = await db.character.updateMany({
    where: { id: character.id, handoverCode: code },
    data: { userId: user.id, handoverCode: null },
  });
  if (claimed.count === 0) {
    return { error: "Somebody else took that adventurer on first." };
  }

  revalidatePath("/characters");
  revalidatePath("/campaigns");
  redirect(`/characters/${character.id}`);
}
