import { db } from "@/lib/db";
import type { HouseholdRole, InviteGrant } from "@/generated/prisma/enums";
import { generateInviteCode, normaliseInviteCode } from "@/lib/auth/invite-code";

export { generateInviteCode, normaliseInviteCode };

/**
 * A usable code, and what it does.
 *
 * The grant travels with the check rather than being looked up again during
 * registration, because the two have to be the same row: reading the code
 * twice is how "validated one invitation, redeemed another" becomes possible.
 */
export type InviteCheck =
  | {
      ok: true;
      inviteId: string;
      grant: InviteGrant;
      /** Which household to join. Null means make one. */
      householdId: string | null;
      intendedRole: HouseholdRole | null;
    }
  | { ok: false; reason: "unknown" | "used" | "expired" };

/**
 * Validates a code without consuming it. Redemption happens inside the
 * registration transaction so a code cannot be spent twice by two
 * simultaneous sign-ups.
 */
export async function checkInviteCode(rawCode: string): Promise<InviteCheck> {
  const code = normaliseInviteCode(rawCode);
  const invite = await db.inviteCode.findUnique({ where: { code } });

  if (!invite) return { ok: false, reason: "unknown" };
  if (invite.redeemedById) return { ok: false, reason: "used" };
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    inviteId: invite.id,
    grant: invite.grant,
    householdId: invite.householdId,
    intendedRole: invite.intendedRole,
  };
}

export const INVITE_ERROR_MESSAGES: Record<"unknown" | "used" | "expired", string> = {
  unknown: "That invite code was not recognised. Check for typos and try again.",
  used: "That invite code has already been used.",
  expired: "That invite code has expired. Ask for a new one.",
};

/** What an invitation will be written as, or why it will not be written. */
export type InvitePlan =
  | {
      ok: true;
      grant: InviteGrant;
      /** Null means the code makes a household rather than joining one. */
      householdId: string | null;
      intendedRole: HouseholdRole | null;
    }
  | { ok: false; reason: string };

/**
 * The rule the whole stage exists for, as a function of its inputs.
 *
 *   - **A new household may only be admitted by whoever runs the installation.**
 *     A parent invites their own children and nobody else's; admitting another
 *     family is not something one family does to another.
 *   - **A member invitation is stamped with the caller's own household**, taken
 *     from their session. A parent has no way to address one at another family:
 *     `targetHouseholdId` is refused outright for them rather than quietly
 *     ignored, because a request that aimed somewhere it may not go deserves an
 *     answer saying so.
 *   - **Whoever runs the installation may aim one anywhere**, which is the one
 *     thing this rule could not express before. A family whose only grown-up
 *     has lost their password, or who needs a second parent adding and cannot
 *     manage it themselves, has to be reachable by somebody — otherwise the
 *     only remedy is a hand-written row in the database, which is not a remedy.
 *
 * It is a plain function rather than four lines inside the server action so the
 * refusals can be tested without a browser and a live session. The action still
 * decides nothing: it parses, asks this, and writes the answer.
 *
 * Note what this deliberately does *not* ask: whether the household has room
 * for another person. That is a question about what the family has paid for
 * rather than about who may act, and it is `seatVerdict`'s — see
 * `lib/billing/caps.ts`. Two questions, two modules, so neither can be
 * accidentally satisfied by answering the other.
 */
export function planInvite(input: {
  actor: { householdId: string | null; everywhere: boolean };
  grant: InviteGrant;
  intendedRole: HouseholdRole | null;
  /** Which household to invite into, when it is not the caller's own. */
  targetHouseholdId?: string | null;
}): InvitePlan {
  const { actor, grant } = input;
  const target = input.targetHouseholdId?.trim() || null;

  if (grant === "NEW_HOUSEHOLD") {
    if (!actor.everywhere) {
      return {
        ok: false,
        reason:
          "Only whoever runs Hearthlight can invite a new family. You can invite people into your own household.",
      };
    }
    // A household's first account is its owner, and `createHousehold` says so
    // when the code is redeemed. Carrying a role here as well would be a second
    // place for the same fact to be written down, and the wrong one.
    return { ok: true, grant, householdId: null, intendedRole: null };
  }

  if (target && !actor.everywhere) {
    return {
      ok: false,
      reason: "You can only invite people into your own household.",
    };
  }

  // The caller's own household is still the answer whenever nothing else was
  // named, so the ordinary path through this function is unchanged: a parent's
  // form carries no target, and never could.
  const householdId = target ?? actor.householdId;

  if (!householdId) {
    return { ok: false, reason: "This account is not part of a household yet. Ask an administrator." };
  }

  return {
    ok: true,
    grant,
    householdId,
    // Blank means they play. A child's account should not arrive able to invite
    // strangers into the house because a field was left unset.
    intendedRole: input.intendedRole ?? "MEMBER",
  };
}

/**
 * Creates a new invite. `createdById` is null for bootstrap codes.
 *
 * This writes what it is told. Whether somebody may ask for a `NEW_HOUSEHOLD`
 * code, and whose household a member code points at, is `planInvite`'s
 * question — one place decides, the other records.
 */
export async function createInvite(options: {
  createdById: string | null;
  note?: string | null;
  expiresInDays?: number | null;
  isBootstrap?: boolean;
  grant?: InviteGrant;
  householdId?: string | null;
  intendedRole?: HouseholdRole | null;
  forName?: string | null;
}) {
  const {
    createdById,
    note,
    expiresInDays,
    isBootstrap = false,
    grant = "HOUSEHOLD_MEMBER",
    householdId = null,
    intendedRole = null,
    forName = null,
  } = options;

  return db.inviteCode.create({
    data: {
      code: generateInviteCode(),
      note: note?.trim() || null,
      createdById,
      isBootstrap,
      grant,
      // A code that starts a household points at none: it makes one.
      householdId: grant === "NEW_HOUSEHOLD" ? null : householdId,
      intendedRole,
      forName: forName?.trim() || null,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    },
  });
}
