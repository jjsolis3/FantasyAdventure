/**
 * Changing the address or username an account signs in with.
 *
 * Two screens ask this question and they must not answer it differently: your
 * own, on the profile page, and somebody else's in your family, on
 * `/settings/people`. What differs between them is *who may* — that is
 * `mayEditSignIn` — and whether a password is required. What must not differ is
 * what counts as a valid handle, and whether this particular account is allowed
 * a username at all.
 */

import { db } from "@/lib/db";
import { z } from "zod";
import { mayUseUsername } from "@/lib/auth/member-authority";
import { USERNAME_MAX, normaliseHandle, usernameProblem } from "@/lib/auth/handle";

export type SignInKind = "email" | "username";

export type HandleOwner = {
  userId: string;
  displayName: string;
  householdRole: string | null;
  platformAdmin: boolean;
};

export { USERNAME_MAX, normaliseHandle };

/**
 * Why this handle cannot be given to this account, or null if it can.
 *
 * The uniqueness check excludes the account itself, so re-saving an unchanged
 * address is not reported as "already taken" — which is what somebody does when
 * they meant to change something else on the same form.
 */
export async function signInProblem(
  handle: string,
  kind: SignInKind,
  owner: HandleOwner,
): Promise<string | null> {
  if (!handle) return kind === "email" ? "Enter an email address." : "Choose a username.";

  if (kind === "email") {
    if (!z.email().safeParse(handle).success) return "That does not look like an email address.";
    if (handle.length > 200) return "That address is too long.";
  } else {
    // The same rule registration applies, asked of an account that already
    // exists. A grown-up of a household is reached by email — that is what the
    // reset flow depends on — so only somebody who plays may hold a username.
    if (!mayUseUsername(owner)) {
      return owner.platformAdmin
        ? "Whoever runs Hearthlight is reached by email, so this account needs an address."
        : `${owner.displayName} helps run the family, and a grown-up's account is reached by email.`;
    }
    const problem = usernameProblem(handle);
    if (problem) return problem;
  }

  const taken = await db.user.findFirst({
    where: {
      id: { not: owner.userId },
      ...(kind === "email" ? { email: handle } : { username: handle }),
    },
    select: { id: true },
  });
  if (taken) {
    return kind === "email"
      ? "Another account already signs in with that address."
      : "Somebody already signs in with that username. Try another.";
  }

  return null;
}

/**
 * The two columns, written so exactly one of them holds a value.
 *
 * Both at once would be a second way to sign in that no screen mentions and
 * nothing would ever check; neither is refused by the database. Switching kind
 * therefore clears the other, which is also what makes "she got an email
 * address at twelve" a single tidy change rather than an account with two
 * identities.
 */
export function signInColumns(handle: string, kind: SignInKind) {
  return kind === "email"
    ? { email: handle, username: null }
    : { username: handle, email: null };
}
