"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/next-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, requireHouseholdParent, requireUser } from "@/lib/auth/session";
import {
  INVITE_ERROR_MESSAGES,
  checkInviteCode,
  createInvite,
  normaliseInviteCode,
  planInvite,
} from "@/lib/auth/invites";
import { createHousehold, householdNameFor } from "@/lib/game/households";
import { shouldAdminister } from "@/lib/auth/platform-admin";

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

  // Who administers this installation. Named by `PLATFORM_ADMIN_EMAIL` when it
  // is set, and otherwise whoever registers first — see `lib/auth/platform-admin.ts`
  // for why the old rule is kept as a fallback rather than removed.
  //
  // Note what this is *not* deciding any more: which family they join. That is
  // the invitation's business now, and it is written on the row rather than
  // inferred from how many accounts happen to exist.
  const administers = shouldAdminister(email, (await db.user.count()) === 0);

  let userId: string;
  try {
    // Creating the user and spending the invite in one transaction closes the
    // race where two people redeem the same code at the same moment: the
    // unique constraint on redeemedById makes the second one fail.
    const user = await db.$transaction(async (tx) => {
      const displayName = parsed.data.displayName.trim();

      const created = await tx.user.create({
        data: {
          email,
          displayName,
          passwordHash,
          role: administers ? "PLATFORM_ADMIN" : "PLAYER",
        },
      });

      // Which family they land in, decided by the invitation they used.
      //
      // Either way they end up in one, in the same transaction as the account:
      // the boundary everything private is drawn around is not a thing anybody
      // should exist outside of, even for the moment between two writes.
      //
      // A code that points at a household puts them in it. One that does not —
      // a new-household code, the bootstrap code, or anything written before
      // this column existed — starts them a house of their own. That fallback
      // is what makes the migration safe for codes already out in the world.
      if (invite.grant === "HOUSEHOLD_MEMBER" && invite.householdId) {
        await tx.householdMember.create({
          data: {
            householdId: invite.householdId,
            userId: created.id,
            // What the invitation said, and otherwise the ordinary answer: they
            // play. A child's account should not arrive able to invite
            // strangers into the house because a field was left blank.
            role: invite.intendedRole ?? "MEMBER",
          },
        });
      } else {
        await createHousehold(tx, {
          ownerId: created.id,
          name: householdNameFor(displayName),
        });
      }

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
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you.").max(60, "That name is a bit long."),
  defaultReadingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
  defaultTone: z.enum(["COZY", "ADVENTUROUS", "SPOOKY"]),
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
  expiresInDays: z.coerce.number().int().min(1).max(365).nullable().catch(null),
  // Anything unrecognised is the *narrower* of the two. A form that omits this,
  // or sends something odd, asks for somebody to join this house — never for a
  // whole new family to be admitted to the installation.
  grant: z.enum(["NEW_HOUSEHOLD", "HOUSEHOLD_MEMBER"]).catch("HOUSEHOLD_MEMBER"),
  // Same principle, and the reason `OWNER` is not on this list at all: a
  // household already has one, and an invitation is not how a second arrives.
  // A blank or unrecognised field means they play, which is what a child's code
  // should be when somebody forgets to say.
  intendedRole: z.enum(["PARENT", "MEMBER"]).catch("MEMBER"),
  forName: z.string().trim().max(60, "That name is a bit long.").optional(),
});

/**
 * Writes an invitation, and refuses the ones that are not the caller's to write.
 *
 * Nothing is decided here. The form is parsed, `planInvite` is asked what may
 * be written, and the answer is written — so the rule about who may admit a
 * family can be read, and tested, in one place instead of being spread across a
 * server action that needs a live session to reach.
 */
export async function createInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireHouseholdParent();

  const parsed = inviteSchema.safeParse({
    expiresInDays: formData.get("expiresInDays") || null,
    grant: formData.get("grant") ?? undefined,
    intendedRole: formData.get("intendedRole") ?? undefined,
    forName: formData.get("forName") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const plan = planInvite({
    actor: { householdId: actor.householdId, everywhere: actor.everywhere },
    grant: parsed.data.grant,
    intendedRole: parsed.data.intendedRole,
  });

  if (!plan.ok) return { error: plan.reason };

  await createInvite({
    createdById: actor.user.id,
    expiresInDays: parsed.data.expiresInDays,
    grant: plan.grant,
    householdId: plan.householdId,
    intendedRole: plan.intendedRole,
    forName: parsed.data.forName ?? null,
  });

  revalidatePath("/settings/invites");
  return { error: "" };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const actor = await requireHouseholdParent();
  const id = formData.get("inviteId");
  if (typeof id !== "string") return;

  // Only unused codes can be revoked; deleting a redeemed one would erase the
  // record of how an account came to exist.
  //
  // Scoped to this household's codes, so one family's parent cannot revoke
  // another's — and either parent in a household can tidy up after the other,
  // which the earlier `createdById` stand-in could not express.
  await db.inviteCode.deleteMany({
    where: { id, redeemedById: null, ...(actor.everywhere ? {} : { householdId: actor.householdId }) },
  });
  revalidatePath("/settings/invites");
}
