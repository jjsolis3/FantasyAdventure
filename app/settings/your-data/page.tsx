import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { WHAT_GOES, WHAT_STAYS } from "@/lib/game/close-household";
import { Alert, Card, PageTitle } from "@/components/ui";
import { CloseHousehold } from "./close-form";

export const dynamic = "force-dynamic";

/**
 * Taking a copy, and leaving.
 *
 * The two halves of the same promise, on one screen on purpose: a family should
 * not be able to find the door without walking past the thing that lets them
 * take their own belongings through it. Every service that puts deletion
 * somewhere else is hoping you will not find it, and that is exactly the reason
 * not to.
 *
 * Both are here rather than on `/settings/billing` because neither is about
 * money. A family running a copy on their own machine, who will never be
 * charged for anything, has the same claim on both.
 */
export default async function YourDataPage() {
  const actor = await requireHouseholdParent();
  if (!actor.householdId) redirect("/settings");

  const household = await db.household.findUnique({
    where: { id: actor.householdId },
    select: {
      name: true,
      _count: { select: { members: true, characters: true, campaigns: true } },
    },
  });
  if (!household) redirect("/settings");

  const isOwner = actor.user.householdRole === "OWNER";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={household.name}
        title="Your family's data"
        lead="Everything here is yours. This is how you take a copy of it, and how you leave."
      />

      <p className="mb-6">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      <Card className="mb-6">
        <h2 className="font-display mb-2 text-xl text-hearth-100">Take a copy</h2>
        <p className="mb-4 text-sm text-hearth-200/70">
          One file with everything this family has written in it — {household._count.characters}{" "}
          {household._count.characters === 1 ? "adventurer" : "adventurers"},{" "}
          {household._count.campaigns}{" "}
          {household._count.campaigns === 1 ? "adventure" : "adventures"} and the whole of each
          story as it was told, turn by turn. It is meant to be readable: open it in any text
          editor and the evening your daughter named the horse is in there.
        </p>

        <a
          href="/api/settings/export"
          className="inline-block rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
        >
          Download everything
        </a>

        <p className="mt-4 text-sm text-hearth-400">
          Passwords, sign-in sessions and reset links are left out — an export is a file that ends
          up in a downloads folder and on a memory stick, and anything in it that grants access
          would be a key travelling by post. Pictures are left out too, because they would turn a
          readable file into tens of megabytes; each one is downloadable from its own adventurer&rsquo;s
          page.
        </p>
      </Card>

      <Card className="border-red-900/40 bg-red-950/10">
        <h2 className="font-display mb-2 text-xl text-red-200">Close this family</h2>

        <p className="mb-4 text-sm text-hearth-200/80">
          This cannot be undone, and there is no grace period — pressing it is the end of it.{" "}
          <strong className="text-hearth-100">Take a copy first.</strong>
        </p>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-red-200">What goes</h3>
            <ul className="mt-2 space-y-1 text-sm text-hearth-200/70">
              {WHAT_GOES.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-moss-400">What stays</h3>
            <ul className="mt-2 space-y-1 text-sm text-hearth-200/70">
              {WHAT_STAYS.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        </div>

        {actor.everywhere ? (
          <Alert>
            You run this installation, so this is not the screen for it — a household is closed by
            whoever answers for it, or from the administration screens.
          </Alert>
        ) : isOwner ? (
          <CloseHousehold householdName={household.name} />
        ) : (
          <Alert>
            Only whoever answers for this family can close it. There{" "}
            {household._count.members === 1 ? "is" : "are"} {household._count.members}{" "}
            {household._count.members === 1 ? "person" : "people"} in it.
          </Alert>
        )}
      </Card>
    </main>
  );
}
