/**
 * What somebody signs in with.
 *
 * Registration required a unique email address, which a nine-year-old has not
 * got. The workarounds families reach for are all bad in the same way: a parent
 * invents `mum+mira@gmail.com`, or hands over an address the child cannot read,
 * or everybody shares a login and the whole point of separate sheets goes away.
 * None of that is a child having an account.
 *
 * So an account is identified by **an email address or a username**, and needs
 * exactly one of them to sign in.
 *
 * ## Which kind is always stated, never guessed
 *
 * This briefly worked by looking for an `@` in what was typed. The sign-up form
 * and the sign-in page *say* which kind they mean now, and the answer travels
 * with the form, so nothing inspects the text to work out what it was meant to
 * be. That is what lets a username be almost anything: dots, spaces, digits
 * first, whatever a child can remember and type.
 *
 * ## The one thing a username may not contain
 *
 * An `@`. Not for parsing — nothing parses any more — but because a username of
 * `dad@example.com` would be indistinguishable from an actual address in every
 * conversation about who is who, and on the administrator's list of accounts.
 * Two columns keep the *software* unconfused; this keeps the people unconfused.
 *
 * ## Why a child's account holds no address
 *
 * Partly because she has not got one. But mostly because an account that never
 * collects an email is an account holding almost no personal data about a
 * child — a display name she chose and the things her character did. If
 * Hearthlight ever takes money it is a service for under-13s, and the least
 * data that makes the thing work is the only defensible amount.
 *
 * ## Who still needs an address
 *
 * Whoever answers for a household. They are the contact when something goes
 * wrong, they are who a password reset would reach, and — later — they are the
 * billing contact. That rule is enforced at registration, tied to the same
 * condition that decides whether the invitation starts a household, so the two
 * cannot drift apart.
 *
 * A username-only account also cannot become the platform administrator:
 * `shouldAdminister` matches on an address, and a null address matches nothing.
 */

/** Which of the two an account signs in with. */
export type HandleKind = "email" | "username";

/**
 * Trimmed, lowercased, and with any run of inner whitespace collapsed to one
 * space. Both kinds are stored this way.
 *
 * The collapsing is forgiveness rather than restriction: a username may contain
 * spaces now, and `mira  b` typed with two of them should still be the same
 * person as `mira b`. A sign-in that fails on invisible whitespace is one a
 * child cannot diagnose and will blame on herself.
 */
export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The longest a username may be.
 *
 * Not a rule about what it may *say* — anything goes there — just a bound, so
 * one cannot be pasted in at a length no screen could ever show.
 */
export const USERNAME_MAX = 60;

/**
 * Whether this username can be stored, typed back, and told apart from an
 * address by a person.
 *
 * Deliberately almost nothing: it has to be there, it has to fit, and it may
 * not contain an `@`. Every other rule about *shape* went when the screens
 * started saying which kind they wanted — those all existed so one box could
 * tell a username from an address by looking at it, and nothing looks now.
 */
export function usernameProblem(username: string): string | null {
  if (username.length === 0) return "Choose a username.";
  if (username.length > USERNAME_MAX) {
    return `A username can be at most ${USERNAME_MAX} characters.`;
  }
  if (username.includes("@")) {
    return "A username cannot contain an @ — that would make it look like somebody's email address.";
  }
  return null;
}

/** Which kind this account signs in with, or null when somehow neither. */
export function signInKind(account: {
  email: string | null;
  username: string | null;
}): HandleKind | null {
  if (account.email) return "email";
  if (account.username) return "username";
  return null;
}

/**
 * What to show somebody about how they sign in.
 *
 * The display name is what appears everywhere a person is *named*; this is for
 * the two or three places that show the account itself — the profile header,
 * the account menu, the administrator's list of who is in which household.
 *
 * It returns the bare text. The administrator's list pairs it with
 * `signInKind`, which is cheap and means a reader never has to wonder.
 */
export function signInName(account: { email: string | null; username: string | null }): string {
  return account.email ?? account.username ?? "no sign-in";
}
