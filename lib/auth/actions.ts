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
import { normaliseHandle, usernameProblem } from "@/lib/auth/handle";
import { signInColumns, signInProblem } from "@/lib/auth/change-sign-in";
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
  handle: z.string().trim().min(1, "Choose how you will sign in.").max(200),
  // Which kind the form was asking for. Stated, never inferred — a username may
  // contain an `@` now, so no amount of looking at the string could tell you.
  // Anything unrecognised is an address, which is the option that can only ever
  // create an ordinary grown-up's account.
  handleKind: z.enum(["email", "username"]).catch("email"),
  password: passwordSchema,
});

const loginSchema = z.object({
  handle: z.string().min(1, "Enter your sign-in."),
  handleKind: z.enum(["email", "username"]).catch("email"),
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
    handle: formData.get("handle"),
    handleKind: formData.get("handleKind") ?? undefined,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const handle = normaliseHandle(parsed.data.handle);
  const code = normaliseInviteCode(parsed.data.inviteCode);

  const invite = await checkInviteCode(code);
  if (!invite.ok) {
    return { error: INVITE_ERROR_MESSAGES[invite.reason], fieldErrors: { inviteCode: INVITE_ERROR_MESSAGES[invite.reason] } };
  }

  // Whether this invitation starts a family or joins one. Computed once, and
  // used for two different decisions below — which household they land in, and
  // whether they are allowed to sign in without an address. Two conditions
  // spelled out separately would be two things to keep in step.
  const startsHousehold = !(invite.grant === "HOUSEHOLD_MEMBER" && invite.householdId);

  const asEmail = parsed.data.handleKind === "email";

  // **A username is a child's account, and only a child's.**
  //
  // Every grown-up here has an address, and holding one is what makes an
  // account ordinary: it is how they are reached when something goes wrong, how
  // a password reset finds them, and who the bill belongs to if this ever takes
  // money. A child has none of that and is better off holding none of it.
  //
  // The invitation already says which this is, because somebody decided it when
  // they wrote the code: a `MEMBER` plays, and anyone else helps run a family.
  // So the rule reads off the invitation rather than trusting the form, and the
  // two cannot disagree.
  const forSomebodyWhoPlays = !startsHousehold && invite.intendedRole === "MEMBER";

  if (!asEmail && !forSomebodyWhoPlays) {
    return {
      error: startsHousehold
        ? "Whoever starts a family signs in with an email address."
        : "Only a child's account signs in with a username. This invitation is for a grown-up.",
      fieldErrors: {
        handle: "An email address, please — a grown-up's account is reached by email.",
      },
    };
  }

  if (asEmail) {
    if (!z.email().safeParse(handle).success) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { handle: "That does not look like an email address." },
      };
    }
  } else {
    const problem = usernameProblem(handle);
    if (problem) {
      return { error: "Please fix the highlighted fields.", fieldErrors: { handle: problem } };
    }
  }

  const taken = await db.user.findFirst({
    where: asEmail ? { email: handle } : { username: handle },
    select: { id: true },
  });
  if (taken) {
    const message = asEmail
      ? "An account already exists for that email."
      : "Somebody already signs in with that username. Try another.";
    return { error: message, fieldErrors: { handle: message } };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // Who administers this installation. Named by `PLATFORM_ADMIN_EMAIL` when it
  // is set, and otherwise whoever registers first — see `lib/auth/platform-admin.ts`
  // for why the old rule is kept as a fallback rather than removed.
  //
  // Note what this is *not* deciding any more: which family they join. That is
  // the invitation's business now, and it is written on the row rather than
  // inferred from how many accounts happen to exist.
  //
  // A username-only account can never be handed the installation: the named
  // address matches nothing, and the first-account fallback cannot fire because
  // the bootstrap invitation starts a household and therefore demands an email.
  const administers = shouldAdminister(asEmail ? handle : null, (await db.user.count()) === 0);

  let userId: string;
  try {
    // Creating the user and spending the invite in one transaction closes the
    // race where two people redeem the same code at the same moment: the
    // unique constraint on redeemedById makes the second one fail.
    const user = await db.$transaction(async (tx) => {
      const displayName = parsed.data.displayName.trim();

      const created = await tx.user.create({
        data: {
          email: asEmail ? handle : null,
          username: asEmail ? null : handle,
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
      if (!startsHousehold && invite.householdId) {
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
    handle: formData.get("handle"),
    handleKind: formData.get("handleKind") ?? undefined,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // One column, decided by which page this came from. Two accounts may present
  // the same text — one as an address and one as a username — and this is why
  // that is unambiguous rather than merely tolerable: the sign-in page says
  // which kind it is asking about, so there is only ever one row to find.
  const handle = normaliseHandle(parsed.data.handle);
  const user =
    parsed.data.handleKind === "email"
      ? await db.user.findUnique({ where: { email: handle } })
      : await db.user.findUnique({ where: { username: handle } });

  // Deliberately vague: saying "no such account" would let anyone test which
  // addresses and usernames are registered. Usernames make that worse rather
  // than better — they are guessable in a way addresses are not — so the
  // vagueness matters more here than it did.
  const genericError = { error: "That sign-in or password is incorrect." };

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

/**
 * Changes the address or username you sign in with yourself.
 *
 * **Asks for your password**, unlike a parent changing a child's. A session
 * somebody else has got hold of could otherwise rewrite the address, then use
 * the forgotten-password flow to take the account permanently — the password is
 * what makes that a dead end rather than a hand-over.
 *
 * Switching kind clears the other column, so an account never holds two
 * identities. Whether this account may hold a username at all is
 * `signInProblem`'s question, and it is the same question registration asks.
 */
export async function changeSignInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessionUser = await requireUser();

  const kind = String(formData.get("handleKind") ?? "email") === "username" ? "username" : "email";
  const handle = normaliseHandle(String(formData.get("handle") ?? ""));
  // Not `currentPassword`: the password form on the same page owns that name.
  const currentPassword = String(formData.get("signInPassword") ?? "");

  const me = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, displayName: true, passwordHash: true, role: true },
  });
  if (!me) return { error: "Account not found." };

  if (!(await verifyPassword(currentPassword, me.passwordHash))) {
    return {
      error: "Your current password is not correct.",
      fieldErrors: { signInPassword: "Your current password is not correct." },
    };
  }

  const problem = await signInProblem(handle, kind, {
    userId: me.id,
    displayName: me.displayName,
    householdRole: sessionUser.householdRole,
    platformAdmin: me.role === "PLATFORM_ADMIN",
  });
  if (problem) return { error: problem, fieldErrors: { handle: problem } };

  await db.user.update({ where: { id: me.id }, data: signInColumns(handle, kind) });

  revalidatePath("/profile");
  return { error: "" };
}
