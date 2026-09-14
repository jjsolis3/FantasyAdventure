import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { RESET_MESSAGES, hashResetToken, resetState } from "@/lib/auth/password-reset";
import { Alert, Card, PageTitle } from "@/components/ui";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

/**
 * Choosing a new password, having proved you hold the address.
 *
 * The link is checked here so a spent or stale one says so before somebody
 * types a password into a form that was never going to work. It is checked
 * *again* in the action, because between this render and that submit the link
 * may have been used in another tab — and because a page is not a guard.
 */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Somebody already signed in does not need this, and following an old link
  // from a mail client should not look broken.
  if (await getCurrentUser()) redirect("/");

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(decodeURIComponent(token)) },
    select: { expiresAt: true, usedAt: true },
  });
  const state = resetState(row);

  return (
    <main className="mx-auto max-w-md px-6 py-16 sm:py-24">
      <PageTitle
        eyebrow="Forgotten password"
        title="Choose a new one"
        lead={state === "ok" ? "Then you will be signed straight in." : undefined}
      />
      <Card>
        {state === "ok" ? (
          <ResetForm token={decodeURIComponent(token)} />
        ) : (
          <>
            <Alert>{RESET_MESSAGES[state]}</Alert>
            <p className="mt-5 text-sm text-hearth-400">
              <Link href="/forgot" className="text-hearth-300 underline hover:text-hearth-200">
                Ask for a new link
              </Link>
              .
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
