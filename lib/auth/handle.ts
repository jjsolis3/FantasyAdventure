/**
 * What somebody signs in with.
 *
 * Registration required a unique email address, which a nine-year-old has not
 * got. The workarounds families reach for are all bad in the same way: a parent
 * invents `daughter+mira@gmail.com`, or hands over an address the child cannot
 * read, or the child shares a login and the whole point of separate sheets goes
 * away. None of that is a child having an account.
 *
 * So an account is identified by **an email address or a username**, and needs
 * exactly one of them to sign in.
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
 * That is deliberate rather than incidental.
 */

/** Trimmed and lowercased. Both kinds of handle are stored this way. */
export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Whether this is meant as an email address rather than a username.
 *
 * The `@` decides, and usernames are forbidden from containing one, so no
 * string can be read both ways. A typo like `mira@` is then an *invalid email*
 * rather than a surprising username, which is the better error to give.
 */
export function looksLikeEmail(handle: string): boolean {
  return handle.includes("@");
}

/** Length bounds, kept here so the form hint and the check cannot disagree. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * Whether this is a username a child could type, remember, and read back.
 *
 * Lowercase letters, digits, dashes and underscores, starting with a letter.
 * Deliberately narrow:
 *
 *   - **No dots**, so nothing ever looks half like an address.
 *   - **No spaces**, because "mira b" typed back with two spaces is a login
 *     failure a nine-year-old cannot debug.
 *   - **Starts with a letter**, so a username is never mistaken for an id.
 *
 * Case is not preserved. There is nowhere it would be shown — the display name
 * is what appears on screen — and preserving it only creates the question of
 * whether `Mira` and `mira` are the same person, which at a family's kitchen
 * table has exactly one right answer.
 */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN) {
    return `A username needs at least ${USERNAME_MIN} characters.`;
  }
  if (username.length > USERNAME_MAX) {
    return `A username can be at most ${USERNAME_MAX} characters.`;
  }
  if (!/^[a-z]/.test(username)) {
    return "A username has to start with a letter.";
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return "A username can use letters, numbers, dashes and underscores — like mira-b.";
  }
  return null;
}

/**
 * What to show somebody about how they sign in.
 *
 * The display name is what appears everywhere a person is *named*; this is for
 * the two or three places that show the account itself — the profile header,
 * the account menu, the administrator's list of who is in which household.
 */
export function signInName(account: { email: string | null; username: string | null }): string {
  return account.email ?? account.username ?? "no sign-in";
}
