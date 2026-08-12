import Link from "next/link";
import { Card } from "@/components/ui";
import type { InProgress, Waiting } from "@/lib/game/where-you-left-off";

/**
 * The adventures actually on the go, at the top of the front page.
 *
 * Each card answers one question — what do I tap to carry on — so the loudest
 * thing on it is the state, not the title. A family that opens this on a
 * Tuesday evening wants "it's your turn", and wants it before they want the
 * name of the storyline.
 */

/** What the card says, and how much it wants to be noticed saying it. */
function waitingLine(waiting: Waiting): { text: string; tone: "urgent" | "quiet" | "done" } {
  switch (waiting.kind) {
    case "YOUR_TURN":
      return {
        // Named, because a household answering for three adventurers needs to
        // know which of them is being waited on.
        text: `Your turn — ${waiting.who.join(" and ")}`,
        tone: "urgent",
      };
    case "WAITING_ON_OTHERS":
      return {
        text: `Waiting for ${waiting.count} ${waiting.count === 1 ? "player" : "players"}`,
        tone: "quiet",
      };
    case "NOT_STARTED":
      return { text: "Ready to begin", tone: "urgent" };
    case "FINISHED":
      return { text: "Finished", tone: "done" };
    case "CARRY_ON":
      return { text: "Carry on", tone: "urgent" };
  }
}

const TONE_STYLES = {
  urgent: "text-amber-300",
  quiet: "text-hearth-400",
  done: "text-moss-400",
} as const;

export function WhereYouLeftOff({ adventures }: { adventures: InProgress[] }) {
  if (adventures.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="font-display mb-4 text-2xl text-hearth-100">Where you left off</h2>

      <ul className="space-y-3">
        {adventures.map((adventure) => {
          const line = waitingLine(adventure.waiting);

          // Finished stories go to how it went; everything else goes straight
          // to the table. A setup that is not begun still lands on the
          // adventure page, which is where the begin button is.
          const href =
            adventure.waiting.kind === "FINISHED"
              ? `/campaigns/${adventure.id}/summary`
              : adventure.waiting.kind === "NOT_STARTED"
                ? `/campaigns/${adventure.id}`
                : `/campaigns/${adventure.id}/play`;

          return (
            <li key={adventure.id}>
              <Link href={href} className="block">
                <Card className="transition-colors hover:border-hearth-700">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-display text-xl text-hearth-100">{adventure.title}</h3>
                    <span className={`text-sm font-medium ${TONE_STYLES[line.tone]}`}>
                      {line.text}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-hearth-400">
                    {adventure.storyline}
                    {adventure.waiting.kind === "FINISHED" ? null : (
                      <>
                        {" · "}chapter {adventure.actIndex} of {adventure.actCount}
                      </>
                    )}
                  </p>

                  {adventure.sceneTitle && adventure.waiting.kind !== "FINISHED" ? (
                    <p className="mt-2 text-hearth-200/70 italic">{adventure.sceneTitle}</p>
                  ) : null}

                  {adventure.party.length > 0 ? (
                    <p className="mt-3 text-sm text-hearth-500">
                      {adventure.party.map((member) => member.name).join(", ")}
                    </p>
                  ) : null}
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
