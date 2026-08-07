import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto max-w-md px-6 py-16 sm:py-24">
      <PageTitle eyebrow="Welcome back" title="Hearthlight" lead="Sign in to continue your family's adventure." />
      <Card>
        <LoginForm />
      </Card>
    </main>
  );
}
