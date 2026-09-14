import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { HouseholdRole, Role } from "@/generated/prisma/enums";
import { mayActForHousehold } from "@/lib/game/households";

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
  /** What this account may do to the *installation*. See `Role`. */
  role: Role;
  /**
   * Which family's data this account's work belongs to, and what it may do
   * inside that family.
   *
   * Carried on the session because almost every write needs it — a new
   * adventurer and a new adventure are both stamped with it — and looking it up
   * again in each of those places would be the same query three times a page.
   *
   * Nullable in the type and never in practice: registration makes a household
   * in the same transaction as the account, and the migration gave one to
   * everybody who already existed. A null here means something is wrong rather
   * than something to handle quietly, which is why the writes that need it
   * refuse rather than invent one.
   */
  householdId: string | null;
  householdRole: HouseholdRole | null;
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
    include: {
      user: {
        // Oldest first, and only one taken. The schema permits an account to
        // belong to more than one household; the code does not yet, and this is
        // one of the two places that decides so — see `singleHouseholdFor`.
        include: { households: { orderBy: { createdAt: "asc" }, take: 1 } },
      },
    },
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

  const membership = session.user.households[0] ?? null;

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
    householdId: membership?.householdId ?? null,
    householdRole: membership?.role ?? null,
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

/**
 * For the screens that belong to whoever runs this installation.
 *
 * The storyteller's settings, the shared adventure library, what everything has
 * cost, and which accounts are in which family. None of it is about anybody's
 * own household, and a parent should never be shown an API key.
 *
 * This used to be `requireAdmin`, which meant both this and "may put my
 * family's sheets right". The two were the same person while one family played
 * and stopped being the same person the moment a second family was invited.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "PLATFORM_ADMIN") redirect("/");
  return user;
}

/**
 * For the screens that belong to one family: its invitations, and putting its
 * own adventurers right.
 *
 * Passes for the household's `OWNER` or `PARENT`, and for a platform
 * administrator — who has to be able to reach any family to support it, and
 * whose own family is one of them.
 *
 * **The guard is never enough on its own.** It says *this person may act for a
 * household*; it cannot say *this is their household*. Every caller has to
 * scope its query by the returned `householdId` as well, or a parent is handed
 * every other family's data — a worse bug than the one this replaces. The
 * return type makes that awkward to forget: the id is what you get back.
 */
export type HouseholdActor = {
  user: SessionUser;
  /** Null only for a platform admin with no household — meaning "everything". */
  householdId: string | null;
  /** True when this person may look past their own family. */
  everywhere: boolean;
};

export async function requireHouseholdParent(): Promise<HouseholdActor> {
  const user = await requireUser();
  const everywhere = user.role === "PLATFORM_ADMIN";

  if (!everywhere && !mayActForHousehold(user.householdRole)) redirect("/");

  return { user, householdId: user.householdId, everywhere };
}

/**
 * Guards for route handlers.
 *
 * `requireUser` and `requirePlatformAdmin` redirect, which is right for a page
 * and wrong for an API: a POST that redirects looks like a success to `fetch`,
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

export async function requirePlatformAdminForApi(): Promise<SessionUser | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to be signed in." }, { status: 401 });
  }
  if (user.role !== "PLATFORM_ADMIN") {
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
