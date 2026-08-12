import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next-path";
import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Somebody already signed in who lands here with a destination should be sent
  // on to it rather than to the front page — this is the path a second tab
  // takes when the first one has already signed in.
  if (await getCurrentUser()) redirect(safeNext(next ?? null));

  return (
    <main className="mx-auto max-w-md px-6 py-16 sm:py-24">
      <PageTitle
        eyebrow="Welcome back"
        title="Hearthlight"
        lead={
          next
            ? "Sign in, and you will be taken straight there."
            : "Sign in to continue your family's adventure."
        }
      />
      <Card>
        <LoginForm next={next} />
      </Card>
    </main>
  );
}
