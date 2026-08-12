import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";

/**
 * Where a wrong address lands.
 *
 * Worth writing rather than leaving to the framework's default, because the two
 * ways a family reaches it are both ordinary: a link to an adventure somebody
 * has since deleted, and an adventurer handed to another account. Neither is an
 * error on their part, so this does not read like one.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <PageTitle
        eyebrow="Not here"
        title="There is nothing at this door"
        lead="Either it was never here, or it has been put away since you last looked."
      />

      <Card>
        <p className="text-hearth-200/70">
          If you followed a link to an adventure, it may have been finished and tidied up, or an
          adventurer may have been handed to somebody else&rsquo;s sign-in.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
          >
            Back to the start
          </Link>
          <Link
            href="/campaigns"
            className="rounded-lg border border-hearth-700 px-4 py-2 font-medium text-hearth-200 hover:bg-hearth-800/50"
          >
            Your adventures
          </Link>
        </div>
      </Card>
    </main>
  );
}
