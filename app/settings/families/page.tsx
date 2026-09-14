import Link from "next/link";
import { redirect } from "next/navigation";
import { familiesOverview, rotateLinkCodeAction, unlinkHouseholdAction } from "@/lib/game/link-actions";
import { Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LinkForm } from "./link-form";

export const dynamic = "force-dynamic";

/**
 * The families yours has agreed to adventure with.
 *
 * Two households that have never met see nothing of each other — not each
 * other's adventurers, not their names, not that they exist. This is the one
 * screen that changes that, and it takes two consents to do it: one family
 * shares its code, the other types it in.
 *
 * There is no inbox and no approval queue, deliberately. The code travels by
 * whatever means two parents already talk to each other, and a row existing is
 * the whole of what "both sides agreed" needs to mean.
 */
export default async function FamiliesPage() {
  const overview = await familiesOverview();
  if (!overview) redirect("/settings");

  const { household, others } = overview;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow={household.name}
        title="Families you adventure with"
        lead="Swap codes with another family and your adventurers can travel together. Until you do, neither of you can see the other's."
      />

      <p className="mb-8">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      <div className="space-y-6">
        <Card>
          <h2 className="font-display mb-2 text-xl text-hearth-100">Your family&rsquo;s code</h2>
          <p className="mb-4 text-sm text-hearth-200/70">
            Give this to a family you want to play with. They type it in on their own version of this
            screen, and that is the whole arrangement.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <code className="rounded bg-hearth-950/70 px-3 py-2 font-mono text-lg text-hearth-100">
              {household.linkCode}
            </code>
            <form action={rotateLinkCodeAction}>
              <SubmitButton variant="secondary" pendingLabel="Changing…">
                Give me a new one
              </SubmitButton>
            </form>
          </div>
          <p className="mt-3 text-sm text-hearth-400">
            A new code stops the old one working. The families you have already linked to stay
            linked — this is for when a code has been somewhere you would rather it had not.
          </p>
        </Card>

        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">Someone gave you a code</h2>
          <LinkForm />
        </Card>

        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">
            Adventuring with{" "}
            <span className="text-base text-hearth-400">({others.length})</span>
          </h2>

          {others.length === 0 ? (
            <p className="text-sm text-hearth-400">
              Nobody yet. Your adventurers can only travel with your own family until you swap a code
              with another.
            </p>
          ) : (
            <ul className="divide-y divide-hearth-800/50">
              {others.map((row) => (
                <li key={row.linkId} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 truncate text-hearth-100">{row.other.name}</span>
                  <span className="text-sm text-hearth-400">
                    since {row.since.toLocaleDateString()}
                  </span>
                  <form action={unlinkHouseholdAction}>
                    <input type="hidden" name="householdId" value={row.other.id} />
                    <SubmitButton variant="danger" pendingLabel="Stopping…">
                      Stop
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-sm text-hearth-400">
            Stopping hides each family&rsquo;s adventurers from the other again, straight away. It does
            not end an adventure already under way — anyone travelling together keeps the story, and
            keeps each other, until it finishes.
          </p>
        </Card>
      </div>
    </main>
  );
}
