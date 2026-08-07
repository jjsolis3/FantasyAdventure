import { db } from "@/lib/db";
import { generateInviteCode, normaliseInviteCode } from "@/lib/auth/invite-code";

export { generateInviteCode, normaliseInviteCode };

export type InviteCheck =
  | { ok: true; inviteId: string }
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

  return { ok: true, inviteId: invite.id };
}

export const INVITE_ERROR_MESSAGES: Record<"unknown" | "used" | "expired", string> = {
  unknown: "That invite code was not recognised. Check for typos and try again.",
  used: "That invite code has already been used.",
  expired: "That invite code has expired. Ask for a new one.",
};

/** Creates a new invite. `createdById` is null for bootstrap codes. */
export async function createInvite(options: {
  createdById: string | null;
  note?: string | null;
  expiresInDays?: number | null;
  isBootstrap?: boolean;
}) {
  const { createdById, note, expiresInDays, isBootstrap = false } = options;

  return db.inviteCode.create({
    data: {
      code: generateInviteCode(),
      note: note?.trim() || null,
      createdById,
      isBootstrap,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    },
  });
}
