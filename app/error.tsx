"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Card, PageTitle } from "@/components/ui";

/**
 * When something actually breaks.
 *
 * Two audiences at once, and this is the one page in the app that has to serve
 * both. A ten-year-old needs to know it is not her fault and that the story is
 * safe; whoever runs the box needs enough to work out what happened. So the
 * reassurance is the page, and the digest is a detail somebody can open.
 *
 * The most likely cause by a distance is the storyteller being unreachable —
 * a local model that is not running, or a machine that went to sleep — so that
 * is named rather than left to be guessed at.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the server log where the person running this can find it. Not
    // shown in full: a stack trace on a family's television is noise at best.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <PageTitle
        eyebrow="Something went wrong"
        title="The storyteller lost their place"
        lead="Nothing you did caused this, and nothing that has happened in your adventure is lost."
      />

      <Card>
        <p className="text-hearth-200/70">
          Trying again usually works. If it keeps happening, the storyteller may not be running —
          whoever set this up can check it on the{" "}
          <Link href="/settings/storyteller" className="text-hearth-300 underline hover:text-hearth-200">
            storyteller page
          </Link>
          .
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-hearth-700 px-4 py-2 font-medium text-hearth-200 hover:bg-hearth-800/50"
          >
            Back to the start
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-5 text-xs text-hearth-500">
            If you are looking in the logs, this one is <code>{error.digest}</code>.
          </p>
        ) : null}
      </Card>
    </main>
  );
}
