"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, requireAdmin, requireUser } from "@/lib/auth/session";
import { INVITE_ERROR_MESSAGES, checkInviteCode, createInvite, normaliseInviteCode } from "@/lib/auth/invites";

/** Shape returned to every auth form. `null` means nothing has been submitted yet. */
export type FormState = { error: string; fieldErrors?: Record<string, string> } | null;

const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MINUTES = 15;

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters — a short phrase is easier to remember than a cryptic password.")
  .max(200, "That password is too long.");

const registerSchema = z.object({
  inviteCode: z.string().min(1, "An invite code is required."),
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(60, "That name is a bit long."),
  email: z.email("That does not look like an email address.").max(200),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    inviteCode: formData.get("inviteCode"),
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const code = normaliseInviteCode(parsed.data.inviteCode);

  const invite = await checkInviteCode(code);
  if (!invite.ok) {
    return { error: INVITE_ERROR_MESSAGES[invite.reason], fieldErrors: { inviteCode: INVITE_ERROR_MESSAGES[invite.reason] } };
  }

  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: "An account already exists for that email.", fieldErrors: { email: "An account already exists for that email." } };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // The very first account is the admin, so somebody can hand out invites.
  const isFirstUser = (await db.user.count()) === 0;

  let userId: string;
  try {
    // Creating the user and spending the invite in one transaction closes the
    // race where two people redeem the same code at the same moment: the
    // unique constraint on redeemedById makes the second one fail.
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          displayName: parsed.data.displayName.trim(),
          passwordHash,
          role: isFirstUser ? "ADMIN" : "PLAYER",
        },
      });

      const spent = await tx.inviteCode.updateMany({
        where: { id: invite.inviteId, redeemedById: null },
        data: { redeemedById: created.id, redeemedAt: new Date() },
      });

      if (spent.count !== 1) throw new Error("INVITE_ALREADY_REDEEMED");

      return created;
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Error && error.message === "INVITE_ALREADY_REDEEMED") {
      return { error: INVITE_ERROR_MESSAGES.used, fieldErrors: { inviteCode: INVITE_ERROR_MESSAGES.used } };
    }
    return { error: "Could not create the account. Please try again." };
  }

  await createSession(userId);
  redirect("/");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  // Deliberately vague: saying "no such account" would let anyone test which
  // email addresses are registered.
  const genericError = { error: "Email or password is incorrect." };

  if (!user) {
    // Spend comparable time on unknown accounts so response timing does not
    // reveal whether the email exists.
    await verifyPassword(parsed.data.password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return genericError;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
    return { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    const attempts = user.failedLoginAttempts + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null,
      },
    });
    return genericError;
  }

  if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you.").max(60, "That name is a bit long."),
  defaultReadingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
  defaultTone: z.enum(["COZY", "ADVENTUROUS"]),
});

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    defaultReadingLevel: formData.get("defaultReadingLevel"),
    defaultTone: formData.get("defaultTone"),
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await db.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath("/profile");
  return { error: "" };
}

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two new passwords do not match.",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessionUser = await requireUser();

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const user = await db.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "Account not found." };

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { error: "Your current password is not correct.", fieldErrors: { currentPassword: "Your current password is not correct." } };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  // Changing a password should end every other session — that is the whole
  // point of changing it after a scare.
  await db.authSession.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);

  revalidatePath("/profile");
  return { error: "" };
}

const inviteSchema = z.object({
  note: z.string().trim().max(120, "Keep the note short.").optional(),
  expiresInDays: z.coerce.number().int().min(1).max(365).nullable().catch(null),
});

export async function createInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = inviteSchema.safeParse({
    note: formData.get("note") ?? undefined,
    expiresInDays: formData.get("expiresInDays") || null,
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await createInvite({
    createdById: admin.id,
    note: parsed.data.note ?? null,
    expiresInDays: parsed.data.expiresInDays,
  });

  revalidatePath("/invites");
  return { error: "" };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("inviteId");
  if (typeof id !== "string") return;

  // Only unused codes can be revoked; deleting a redeemed one would erase the
  // record of how an account came to exist.
  await db.inviteCode.deleteMany({ where: { id, redeemedById: null } });
  revalidatePath("/invites");
}
