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
export function shouldAdminister(email: string | null, firstAccount: boolean): boolean {
  const named = namedPlatformAdmin();
  // A child's account has no address at all, so it matches no named
  // administrator — and cannot take the installation through the fallback
  // either, since the only invitation that reaches the fallback is one that
  // starts a household, and those are required to sign in with an address.
  if (named) return email !== null && email.trim().toLowerCase() === named;
  return email !== null && firstAccount;
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

export type RoleVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Handing the installation to somebody else, or taking it back.
 *
 * `PLATFORM_ADMIN_EMAIL` only decides who becomes an administrator **at
 * registration**, and `User.role` was written in exactly one place —
 * `registerAction`. So changing the environment variable on a running server
 * did nothing to the accounts already on it, and there was no way at all to
 * move the role afterwards except by editing a row by hand. That is a bad
 * enough answer for one person with pgAdmin open; it is not an answer at all
 * for anybody else.
 *
 * Three refusals, and the second is the interesting one:
 *
 *   1. **Only an administrator may hand it on.** Obvious, and checked here
 *      rather than trusted to the screen the control happens to be on.
 *
 *   2. **Never your own account.** Not caution — a shape. A hand-over done this
 *      way is always performed *by the account receiving it*: you promote the
 *      new one, sign in as it, and it retires the old one. That proves the new
 *      account actually works while the old one can still fix it. Allowing
 *      self-demotion would let somebody give away the last working key and find
 *      out afterwards that the new one does not turn.
 *
 *   3. **Never the last administrator**, so an installation cannot be left with
 *      nobody able to reach the storyteller's settings.
 *
 * And one about who may be given it: an account that signs in with a username
 * rather than an address. Those are children's accounts — that is the whole
 * reason the column exists — and the installation's API keys are not a thing to
 * put one keystroke away from a nine-year-old. It also keeps this agreeing with
 * `shouldAdminister`, which has always required an address.
 */
export function mayChangePlatformRole(input: {
  actor: { id: string; platformAdmin: boolean };
  target: { id: string; platformAdmin: boolean; hasEmail: boolean; displayName: string };
  /** True to hand it over, false to take it back. */
  makeAdmin: boolean;
  /** Administrators other than the target. */
  otherAdmins: number;
}): RoleVerdict {
  const { actor, target, makeAdmin, otherAdmins } = input;

  if (!actor.platformAdmin) {
    return { ok: false, reason: "Only whoever runs Hearthlight can hand it on." };
  }

  if (actor.id === target.id) {
    return {
      ok: false,
      reason:
        "You cannot change your own. Give it to the other account first, sign in as that one, " +
        "and retire this one from there — that way you find out the new sign-in works while " +
        "this one can still put it right.",
    };
  }

  if (makeAdmin) {
    if (target.platformAdmin) return { ok: false, reason: `${target.displayName} already does.` };
    if (!target.hasEmail) {
      return {
        ok: false,
        reason:
          `${target.displayName} signs in with a username rather than an email address, which is ` +
          "what a child's account does. Running the installation needs an address.",
      };
    }
    return { ok: true };
  }

  if (!target.platformAdmin) return { ok: false, reason: `${target.displayName} already does not.` };
  if (otherAdmins === 0) {
    return {
      ok: false,
      reason:
        `${target.displayName} is the only administrator. Give somebody else the installation ` +
        "first, or there will be nobody who can reach the storyteller's settings.",
    };
  }

  return { ok: true };
}
