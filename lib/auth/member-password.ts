/**
 * Who may set somebody else's password.
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
 * Written as a plain function rather than a stack of conditions inside the
 * server action, because the interesting cases are the refusals and a refusal
 * that needs a browser session to reach is a refusal that stops being tested.
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
