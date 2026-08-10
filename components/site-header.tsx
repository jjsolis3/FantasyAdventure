import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { AccountMenu } from "@/components/account-menu";
import { NavLinks } from "@/components/nav-links";

/**
 * The bar every page wears.
 *
 * Two things a family goes to on the left, and everything about the account
 * behind an avatar on the right. What used to be here — invites, the
 * storyteller, a name that was really a profile link, and a sign-out button
 * given the same weight as the game itself — was four administrative doors
 * competing with the two anybody uses.
 *
 * Signed out, the only thing worth offering is a way in, and it looks like a
 * button rather than a link because it is the one thing to do on the page.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="print-hide sticky top-0 z-40 border-b border-hearth-800/50 bg-hearth-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
        <Link
          href="/"
          className="font-display shrink-0 text-lg text-hearth-100 transition-colors hover:text-hearth-50"
        >
          Hearthlight
        </Link>

        {user ? <NavLinks /> : null}

        <div className="flex-1" />

        {user ? (
          <AccountMenu
            displayName={user.displayName}
            email={user.email}
            isAdmin={user.role === "ADMIN"}
          />
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-hearth-600 px-4 py-2 text-sm font-medium text-hearth-50 transition-colors hover:bg-hearth-500"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
