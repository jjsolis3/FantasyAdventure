/**
 * Where to go after signing in.
 *
 * A player taps the link in an "it's your turn" alert, gets asked to sign in,
 * signs in, and lands on the front page — then has to find the adventure again.
 * The alerts make that path common rather than occasional, so the destination
 * travels with them.
 *
 * In its own module rather than beside the sign-in action because that file is
 * `"use server"`, where every export has to be an async server action. A pure
 * string check is neither, and a plain function is what the login page needs to
 * call while rendering.
 */

/**
 * Only same-site paths survive.
 *
 * Strict on purpose. A value must begin with a single `/`:
 *
 *   - `//evil.example` is a protocol-relative URL, which browsers resolve
 *     against another origin. Accepting it would turn a sign-in form into an
 *     open redirect — the classic way one is introduced.
 *   - `/\evil.example` is the same trick with a backslash, which some browsers
 *     normalise to a slash.
 *   - Anything not starting with `/` is either absolute or nonsense.
 *
 * Everything rejected falls back to the front page, which is never wrong, only
 * less helpful.
 */
export function safeNext(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  return value;
}
