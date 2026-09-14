/**
 * What a household's grown-ups may do to the people in it.
 *
 * A nine-year-old will forget her password. Before this there was nothing
 * anybody could do about it: a password is set at registration and changed on
 * the profile screen, which asks for the current one. No reset, no override.
 * The account was gone, with every adventurer on it, and neither her parent nor
 * whoever runs the installation could help.
 *
 * That is the hole this closes, and it is closed the way a family actually
 * works: **the grown-up sitting next to her sets a new one.** No email, no
 * token, no link to click — she has no address to send any of that to, which is
 * precisely why she needed this.
 *
 * ## The rule, and the escalation it is guarding against
 *
 * Authority runs downwards and never sideways or up:
 *
 *   - An **owner** may reset a parent or a member of their own household.
 *   - A **parent** may reset a member only — not another parent, and not the
 *     owner. Otherwise "promote the eldest to parent so she can help" quietly
 *     becomes "the eldest can take the household from you".
 *   - A **member** may reset nobody.
 *   - A **platform administrator** may reset anybody in any household, because
 *     somebody has to be able to help a family who cannot help themselves —
 *     except another platform administrator, so two operators cannot lock each
 *     other out of the installation.
 *   - **Nobody resets a platform administrator through household authority.**
 *     Being the owner of the household that person happens to live in is not a
 *     route to the storyteller's API key.
 *   - **Nobody resets themselves here.** Knowing your own password means the
 *     profile screen, which asks for it. This screen is for the person who has
 *     forgotten, and the refusal says where to go instead.
 *
 * Written as plain functions rather than stacks of conditions inside server
 * actions, because the interesting cases are the refusals and a refusal that
 * needs a browser session to reach is a refusal that stops being tested.
 *
 * ## A household runs itself
 *
 * These used to be the platform administrator's job, which was wrong in a way
 * that only showed once the two roles lived on different accounts: promoting
 * your own spouse meant signing out and in as the operator. A household is the
 * unit a family is administered in, so its owner administers it.
 *
 * What stays with the operator is what belongs to the *installation*: admitting
 * a new family, moving an account between families, and handing a household to
 * a different owner. None of those is a thing one family does to itself.
 */

export type PasswordActor = {
  userId: string;
  householdId: string | null;
  /** Their role in that household, or null if they are in none. */
  householdRole: string | null;
  platformAdmin: boolean;
};

export type PasswordTarget = {
  userId: string;
  householdId: string | null;
  householdRole: string | null;
  platformAdmin: boolean;
};

export type ResetVerdict = { ok: true } | { ok: false; reason: string };

const ALLOWED = "That is not yours to reset.";

export function mayResetPassword(actor: PasswordActor, target: PasswordTarget): ResetVerdict {
  if (actor.userId === target.userId) {
    return {
      ok: false,
      reason: "To change your own password, use your profile — it will ask for the current one.",
    };
  }

  // The installation's own account is never reachable through a family's
  // authority, whoever that family is.
  if (target.platformAdmin) {
    return actor.platformAdmin
      ? { ok: false, reason: "One administrator cannot reset another's password." }
      : { ok: false, reason: ALLOWED };
  }

  // Somebody has to be able to help a household that cannot help itself.
  if (actor.platformAdmin) return { ok: true };

  if (!actor.householdId || actor.householdId !== target.householdId) {
    return { ok: false, reason: ALLOWED };
  }

  if (actor.householdRole === "OWNER") {
    return { ok: true };
  }

  if (actor.householdRole === "PARENT") {
    return target.householdRole === "MEMBER"
      ? { ok: true }
      : { ok: false, reason: "Only whoever answers for this family can reset a grown-up's password." };
  }

  return { ok: false, reason: ALLOWED };
}

/**
 * Whether this account may sign in with a username rather than an address.
 *
 * The same rule registration applies, asked of an account that already exists —
 * because a role can change afterwards. Promote a child to help run the family
 * and she becomes a grown-up of the household, which means an address; the
 * screens have to be able to say so before the change rather than after.
 */
export function mayUseUsername(target: {
  householdRole: string | null;
  platformAdmin: boolean;
}): boolean {
  return !target.platformAdmin && target.householdRole === "MEMBER";
}

/**
 * Who may change somebody's role in a household.
 *
 * Only the owner, and never their own. Their own is the one that must not move
 * from inside: an owner who demotes themselves leaves a family with nobody able
 * to invite, reset a password, or put a sheet right, and the person who could
 * undo it is the one who just gave the power away. Handing a household to a
 * different owner stays with the operator, where an accident is recoverable.
 *
 * A parent may not promote — not themselves, not anybody. That is the whole of
 * the escalation guard: if a parent could hand out `PARENT`, "promote the
 * eldest so she can help" would quietly become a way around every rule that
 * distinguishes the two.
 */
export function maySetRole(
  actor: PasswordActor,
  target: PasswordTarget,
  newRole: string,
): ResetVerdict {
  if (actor.userId === target.userId) {
    return { ok: false, reason: "You cannot change your own role." };
  }

  if (target.platformAdmin) {
    return { ok: false, reason: "That account's role is not a family's to set." };
  }

  if (newRole !== "PARENT" && newRole !== "MEMBER") {
    // `OWNER` is deliberately absent. One household has one, and moving it is a
    // handover rather than an edit — see the note above.
    return { ok: false, reason: "Pick whether they help run the family or only play." };
  }

  if (actor.platformAdmin) return { ok: true };

  if (!actor.householdId || actor.householdId !== target.householdId) {
    return { ok: false, reason: ALLOWED };
  }

  return actor.householdRole === "OWNER"
    ? { ok: true }
    : { ok: false, reason: "Only whoever answers for this family can change what somebody may do." };
}

/**
 * Who may change the address or username somebody signs in with.
 *
 * The same shape as resetting a password, and for the same reason: a child who
 * wants a different username, or who has finally got an address of her own,
 * should not have to be old enough to manage it herself. Changing *your own*
 * is a different question with a different answer — see `changeSignInAction`,
 * which asks for your password, because a hijacked session that could rewrite
 * the address could then use the forgotten-password flow to keep the account.
 */
export function mayEditSignIn(actor: PasswordActor, target: PasswordTarget): ResetVerdict {
  return mayResetPassword(actor, target);
}
