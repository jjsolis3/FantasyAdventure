"use server";

/**
 * Asking for a reset link, and spending one.
 *
 * The half of "I have forgotten my password" that belongs to grown-ups. A child
 * has no address to send to; her parent sets her password directly, on
 * `/settings/people`.
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { normaliseHandle } from "@/lib/auth/handle";
import { isConfigured, sendMail } from "@/lib/mail/send";
import {
  RESET_COOLDOWN_MINUTES,
  RESET_MESSAGES,
  RESET_WINDOW_MINUTES,
  hashResetToken,
  makeResetToken,
  resetLink,
  resetState,
} from "@/lib/auth/password-reset";

export type ResetFormState = { error: string; done?: string } | null;

/**
 * The same sentence whether or not that address has an account.
 *
 * Saying "no account for that address" would turn this form into a way to test
 * which of a list of addresses are registered here. The person who really does
 * have an account is not inconvenienced by the vagueness — their email arrives.
 */
const SENT = `If that address has an account, a link is on its way. It is good for ${RESET_WINDOW_MINUTES} minutes.`;

export async function requestResetAction(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  if (!isConfigured()) {
    return {
      error:
        "This installation cannot send email yet. Ask whoever runs Hearthlight to reset it for you.",
    };
  }

  const parsed = z
    .object({ email: z.string().trim().min(1, "Enter your email address.").max(200) })
    .safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter your email address." };

  const email = normaliseHandle(parsed.data.email);

  // Only ever an address. A child's account has none, and a username typed here
  // finds nothing — which is the right answer rather than a special case: she
  // is not the person this form is for.
  const user = await db.user.findUnique({ where: { email }, select: { id: true, displayName: true } });

  if (user) {
    const recent = await db.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - RESET_COOLDOWN_MINUTES * 60 * 1000) },
      },
      select: { id: true },
    });

    // Already sent one a moment ago. Say the same thing and send nothing, so a
    // stuck button or a prefetching mail client cannot post a queue of links.
    if (!recent) {
      const { token, tokenHash, expiresAt } = makeResetToken();
      const link = resetLink(token);

      if (!link) {
        // `APP_URL` unset. Refusing to guess it from the request's Host header
        // is the whole reason this can fail — a header an attacker controls
        // would let them have the link built to point at their own machine.
        console.error("[reset] APP_URL is not set, so no reset link can be built");
        return {
          error:
            "This installation is not set up to send reset links yet. Ask whoever runs Hearthlight.",
        };
      }

      // Any earlier unspent link stops working the moment a new one is made, so
      // the most recent email is always the live one and an old message
      // forwarded or left in a sent folder is inert.
      await db.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
        await tx.passwordResetToken.create({ data: { tokenHash, userId: user.id, expiresAt } });
      });

      await sendMail({
        to: email,
        subject: "Your Hearthlight password",
        text:
          `Hello ${user.displayName},\n\n` +
          `Somebody asked to reset the password for your Hearthlight account. ` +
          `If that was you, open this link:\n\n${link}\n\n` +
          `It works once, and only for the next ${RESET_WINDOW_MINUTES} minutes.\n\n` +
          `If it was not you, nothing has changed and you can ignore this — ` +
          `your password still works.\n`,
      });
    }
  }

  return { error: "", done: SENT };
}

const newPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(10, "Use at least 10 characters — a short phrase is easier to remember.")
    .max(200, "That password is too long."),
  confirmPassword: z.string().min(1, "Type it again."),
});

/**
 * Spends a link and signs them in.
 *
 * Signing in immediately is deliberate: somebody who has just proved they hold
 * the address and chosen a new password has done everything a sign-in would ask
 * for, and sending them to a login screen to type it again is ceremony.
 */
export async function completeResetAction(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const parsed = newPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields." };
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "Those two passwords do not match." };
  }

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(parsed.data.token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  const state = resetState(row);
  if (state !== "ok" || !row) return { error: RESET_MESSAGES[state as Exclude<typeof state, "ok">] };

  try {
    await db.$transaction(async (tx) => {
      // Spent first, and conditionally, so two clicks arriving together cannot
      // both go through: the second updates nothing and throws. The unique
      // `tokenHash` makes this a single-row race rather than a scan.
      const spent = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (spent.count !== 1) throw new Error("RESET_ALREADY_USED");

      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: await hashPassword(parsed.data.password),
          // Somebody resetting has very often locked themselves out first.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      // Every session on the account ends. If the reason for the reset was that
      // somebody else had got in, a live session of theirs would survive the
      // password change and defeat the whole exercise.
      await tx.authSession.deleteMany({ where: { userId: row.userId } });
      // And any other unspent link, so a second one in the inbox is inert.
      await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESET_ALREADY_USED") {
      return { error: RESET_MESSAGES.used };
    }
    throw error;
  }

  // Outside the try: `redirect` works by throwing, and catching it here would
  // swallow the navigation.
  await createSession(row.userId);
  redirect("/");
}
