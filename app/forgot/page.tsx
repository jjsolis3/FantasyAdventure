import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isConfigured } from "@/lib/mail/send";
import { Alert, Card, PageTitle } from "@/components/ui";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

/**
 * "I have forgotten my password", for the half of the accounts that have
 * somewhere to send to.
 *
 * A child signs in with a username and holds no address at all, which is the
 * point of her account — so there is nothing to email her and this page is not
 * for her. The grown-up next to her sets her password directly, at
 * Settings → Your family. The page says so, because otherwise a parent standing
 * at this form on her behalf has no way to know where to go instead.
 */
export default async function ForgotPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto max-w-md px-6 py-16 sm:py-24">
      <PageTitle
        eyebrow="Forgotten password"
        title="Let's get you back in"
        lead="We will email you a link that lets you choose a new password."
      />
      <Card>
        {isConfigured() ? (
          <ForgotForm />
        ) : (
          <Alert tone="info">
            This installation cannot send email yet, so there is no link to send. Ask whoever runs
            Hearthlight to set a new password for you.
          </Alert>
        )}

        <p className="mt-6 border-t border-hearth-800/50 pt-4 text-sm text-hearth-400">
          Signing in with a <strong className="text-hearth-300">username</strong> rather than an
          email? That is a child&rsquo;s account, and it holds no address to send anything to — ask
          the grown-up who set it up. They can choose a new password from{" "}
          <span className="text-hearth-300">Settings → Your family</span>.
        </p>
      </Card>
    </main>
  );
}
