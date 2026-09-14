import Link from "next/link";
import { redirect } from "next/navigation";
import { householdPeople } from "@/lib/game/people-actions";
import { signInKind, signInName } from "@/lib/auth/handle";
import { Card, PageTitle } from "@/components/ui";
import { PeopleList, type Person } from "./reset-form";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "answers for the family",
  PARENT: "helps run the family",
  MEMBER: "plays",
};

/**
 * Who is in your family, and helping one of them back in.
 *
 * The screen exists because of a hole that had nothing to do with households: a
 * password was set at registration and changed only where the current one is
 * asked for, so a child who forgot hers was locked out for good. She has no
 * email address — that is the point of her having a username — so there was
 * nothing to send a reset link to, and no link to send.
 */
export default async function PeoplePage() {
  const overview = await householdPeople();
  if (!overview) redirect("/settings");

  const people: Person[] = overview.people.map((person) => ({
    id: person.id,
    displayName: person.displayName,
    signIn: signInName(person),
    isUsername: signInKind(person) === "username",
    roleLabel: person.platformAdmin
      ? "runs Hearthlight"
      : (ROLE_LABELS[person.householdRole] ?? person.householdRole),
    mayReset: person.mayReset,
    isYou: person.id === overview.actorId,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={overview.household.name}
        title="Your family"
        lead="Everybody with a sign-in of their own — and what to do when one of them forgets it."
      />

      <p className="mb-8">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      <Card>
        <PeopleList people={people} />

        <p className="mt-6 border-t border-hearth-800/50 pt-4 text-sm text-hearth-400">
          Nothing is emailed, because a child&rsquo;s account holds no address to email — you set the
          new password here and tell it to them. To change your <em>own</em>, use your profile: it
          asks for the current one, which is the right question when you still know it.
        </p>
      </Card>
    </main>
  );
}
