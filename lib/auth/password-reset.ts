/**
 * "I have forgotten my password", for the accounts that have somewhere to send.
 *
 * Hearthlight holds two kinds of account and they need two different answers.
 *
 *   - A **child** signs in with a username and holds no address at all — that
 *     is the point of her account. There is nowhere to send a link, so the
 *     grown-up next to her sets a new password directly. See
 *     `lib/auth/member-authority.ts`.
 *   - A **grown-up** holds an address, which is what makes the account
 *     ordinary. They get a link, and need nobody's help.
 *
 * Between them the two mechanisms cover everybody, which is the point of
 * usernames being a child's account and only a child's.
 *
 * ## What is stored
 *
 * Only the hash, exactly as `AuthSession` stores only the hash of a session
 * token. There is never a reason to read a token back — the sole question asked
 * of one is "does this match what somebody just presented?" — and a database
 * that leaks should not hand over live reset links along with everything else.
 *
 * ## The link has to be built from configured truth
 *
 * Never from the request's `Host` header. A reset link is the one piece of this
 * app that grants an account to whoever holds it, and a header an attacker
 * controls would let them have the link built to point at their own machine and
 * emailed to your address. `APP_URL` is explicit or the feature is off.
 */

import { createHash, randomBytes } from "node:crypto";

/** How long a link is good for. Long enough to find the email, short enough. */
export const RESET_WINDOW_MINUTES = 60;

/**
 * How long before the same address may ask again.
 *
 * Not really rate limiting — it is a family app behind an invite wall — but it
 * stops a stuck "send" button, or a mail client that prefetches, from posting a
 * queue of links to somebody's inbox.
 */
export const RESET_COOLDOWN_MINUTES = 2;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh token: the secret to email, and the hash to store. */
export function makeResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
  // 32 bytes, the same width as a session token. base64url so it survives being
  // pasted out of an email client and back into a browser unmangled.
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_WINDOW_MINUTES * 60 * 1000),
  };
}

/** Where this installation lives, or null when nobody has said. */
export function appUrl(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** The link to email, or null when `APP_URL` is unset. */
export function resetLink(token: string): string | null {
  const base = appUrl();
  return base ? `${base}/reset/${encodeURIComponent(token)}` : null;
}

export type StoredReset = {
  expiresAt: Date;
  usedAt: Date | null;
};

export type ResetState = "ok" | "unknown" | "used" | "expired";

/**
 * Whether a presented link may still be spent.
 *
 * `used` and `expired` are told apart from `unknown` deliberately. A link that
 * has been clicked twice — or prefetched by a mail client and then clicked —
 * should say what happened rather than give the blank "not recognised" that
 * invites somebody to assume they mistyped and try again. None of the three
 * says anything about whether an *account* exists, which is the thing worth
 * keeping quiet.
 */
export function resetState(row: StoredReset | null, now: Date = new Date()): ResetState {
  if (!row) return "unknown";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

export const RESET_MESSAGES: Record<Exclude<ResetState, "ok">, string> = {
  unknown: "That link was not recognised. Ask for a new one and use the most recent email.",
  used: "That link has already been used. Ask for a new one if you still need it.",
  expired: `That link has expired — they are good for ${RESET_WINDOW_MINUTES} minutes. Ask for a new one.`,
};
