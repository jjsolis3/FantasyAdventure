import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { signInKind, signInName } from "@/lib/auth/handle";
import { mayUseUsername } from "@/lib/auth/member-authority";
import { Card, PageTitle } from "@/components/ui";
import { PasswordForm, ProfileForm, SignInForm } from "./profile-forms";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const sessionUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle eyebrow="Your account" title={user.displayName} lead={signInName(user)} />

      <div className="space-y-6">
        <Card>
          <h2 className="font-display mb-5 text-xl text-hearth-100">Table preferences</h2>
          <ProfileForm
            displayName={user.displayName}
            defaultReadingLevel={user.defaultReadingLevel}
            defaultTone={user.defaultTone}
          />
        </Card>

        <Card>
          <h2 className="font-display mb-5 text-xl text-hearth-100">How you sign in</h2>
          <SignInForm
            signIn={signInName(user)}
            isUsername={signInKind(user) === "username"}
            mayUseUsername={mayUseUsername({
              householdRole: sessionUser.householdRole,
              platformAdmin: user.role === "PLATFORM_ADMIN",
            })}
          />
        </Card>

        <Card>
          <h2 className="font-display mb-5 text-xl text-hearth-100">Password</h2>
          <PasswordForm />
        </Card>
      </div>
    </main>
  );
}
