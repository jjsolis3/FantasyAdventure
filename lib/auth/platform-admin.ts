/**
 * Who administers this installation.
 *
 * The rule used to be "whoever registers first", decided by counting the users
 * table in three separate places. That is a reasonable rule for a family
 * putting a copy on their own server, and a bad one for anything public: an
 * empty database is one restored backup or one botched migration away, and the
 * first stranger to reach `/register` would inherit the storyteller's API key,
 * every household's usage, and the shared adventure library.
 *
 * So the answer is named instead. `PLATFORM_ADMIN_EMAIL` says which address
 * becomes the administrator, whoever gets there first and whenever they do.
 *
 * **Unset, the old rule still applies**, with a warning in the log. This is a
 * live server with a family on it; a change to who may administer it should not
 * be able to lock anybody out of their own installation because an environment
 * variable was missed on a deploy. The existing administrator is unaffected
 * either way — they already hold the role, and the enum rename did not touch
 * the rows.
 */

/** The address that becomes the administrator, or null when nobody is named. */
export function namedPlatformAdmin(): string | null {
  const raw = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  return raw ? raw : null;
}

/**
 * Whether this registration should be handed the installation.
 *
 * `firstAccount` is only consulted when nobody is named — it is the fallback,
 * not a second way in. With an address configured, being first counts for
 * nothing, which is the whole point.
 */
export function shouldAdminister(email: string, firstAccount: boolean): boolean {
  const named = namedPlatformAdmin();
  if (named) return email.trim().toLowerCase() === named;
  return firstAccount;
}

/**
 * What the bootstrap banner should say about the account it is inviting.
 *
 * The code itself is still printed on an empty installation whether or not an
 * address is named — it has to be, because registration needs a code and there
 * is nobody yet who could make one. Withholding it would not be a safeguard, it
 * would be a locked door with the key inside.
 *
 * What changes is what the code *confers*. Unnamed, it still hands over the
 * installation, and the banner says so. Named, it only creates an account, and
 * a stranger who somehow came by the code gets an ordinary one — which is the
 * whole improvement.
 */
export function bootstrapBannerLine(): string {
  const named = namedPlatformAdmin();
  return named
    ? `  Registering as ${named} makes that account the administrator.`
    : "  That account becomes the administrator.";
}
