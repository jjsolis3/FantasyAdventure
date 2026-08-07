import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/submit-button";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-hearth-800/50">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4">
        <Link href="/" className="font-display text-lg text-hearth-100 hover:text-hearth-50">
          Hearthlight
        </Link>

        <div className="flex-1" />

        {user ? (
          <>
            {user.role === "ADMIN" ? (
              <Link href="/invites" className="text-sm text-hearth-300 hover:text-hearth-100">
                Invites
              </Link>
            ) : null}
            <Link href="/profile" className="text-sm text-hearth-300 hover:text-hearth-100">
              {user.displayName}
            </Link>
            <form action={logoutAction}>
              <SubmitButton variant="secondary" pendingLabel="Signing out…">Sign out</SubmitButton>
            </form>
          </>
        ) : (
          <Link href="/login" className="text-sm text-hearth-300 hover:text-hearth-100">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
