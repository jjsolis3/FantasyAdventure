import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");

  const isFirstAccount = (await db.user.count()) === 0;

  return (
    <main className="mx-auto max-w-md px-6 py-16 sm:py-24">
      <PageTitle
        eyebrow={isFirstAccount ? "First account" : "Join the table"}
        title="Create your account"
        lead={
          isFirstAccount
            ? "Nobody has signed up yet, so this account becomes the administrator and can invite everyone else."
            : "Hearthlight is invite-only, so you will need a code to sign up."
        }
      />
      <Card>
        <RegisterForm isFirstAccount={isFirstAccount} />
      </Card>
    </main>
  );
}
