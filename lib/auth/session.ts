import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

const COOKIE_NAME = "hearthlight_session";
const SESSION_DAYS = 30;

/** Refresh the expiry only after this much of the window has elapsed, so a
 *  normal page view does not write to the database every time. */
const REFRESH_AFTER_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Whether to mark the session cookie `Secure`.
 *
 * This cannot be hardcoded to `NODE_ENV === "production"`. A fresh Coolify
 * deployment is served over plain http on an sslip.io domain until a real
 * domain and certificate are set up, and a Secure cookie is silently dropped
 * over http — sign-in would appear to succeed and then bounce straight back to
 * the login page. Deriving it from the proxy's forwarded protocol means the
 * flag switches itself on the moment TLS is in front of the app.
 *
 * Set COOKIE_SECURE=true to force it on regardless.
 */
async function shouldUseSecureCookie(): Promise<boolean> {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;

  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

/** Issues a new session and sets the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);

  await db.authSession.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await shouldUseSecureCookie(),
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

/**
 * Resolves the signed-in user, or null. Safe to call from any server component.
 *
 * Expired sessions are deleted on sight rather than left to accumulate; there
 * is no background job in this app and never needs to be.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.authSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Sliding expiry: staying active keeps you signed in, going quiet logs you out.
  const age = Date.now() - session.lastSeenAt.getTime();
  if (age > REFRESH_AFTER_DAYS * DAY_MS) {
    await db.authSession
      .update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
        },
      })
      .catch(() => {});
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

/** Deletes the current session server-side and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }

  cookieStore.delete(COOKIE_NAME);
}

/**
 * For pages that require a signed-in user. Redirects to /login otherwise.
 *
 * Carries where they were going, so a player who taps "it's your turn" from a
 * phone that has signed itself out lands on the turn rather than on the front
 * page needing to find the adventure again. The path comes from the middleware
 * (see `middleware.ts`); when it is missing this behaves exactly as before.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const path = (await headers()).get("x-pathname");
    redirect(path && path !== "/" ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  return user;
}

/** For admin-only pages. Sends non-admins home rather than to login. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/**
 * Guards for route handlers.
 *
 * `requireUser` and `requireAdmin` redirect, which is right for a page and
 * wrong for an API: a POST that redirects looks like a success to `fetch`,
 * which follows it and reports 200. These return a 403 instead, so refusal is
 * unambiguous to a caller and to a test.
 */
export async function requireUserForApi(): Promise<SessionUser | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to be signed in." }, { status: 401 });
  }
  return user;
}

export async function requireAdminForApi(): Promise<SessionUser | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to be signed in." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return Response.json({ error: "Administrators only." }, { status: 403 });
  }
  return user;
}

/**
 * Constant-time string comparison for user-supplied secrets such as invite
 * codes, so a timing difference cannot be used to guess them character by
 * character.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
