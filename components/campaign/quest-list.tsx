import Link from "next/link";

export type QuestObjectiveView = {
  id: string;
  kind: "FIND" | "DEED";
  text: string;
  done: boolean;
  /** What actually satisfied it, when that is not the words the chapter used. */
  itemName: string | null;
  foundByName: string | null;
  consumed: boolean;
  /**
   * The words the game would actually accept, for a FIND still outstanding.
   *
   * See `whatWouldCount` in `lib/game/finds.ts`. Empty for a DEED and for
   * anything already ticked off.
   */
  counts: string[];
};

export type QuestView = {
  id: string;
  kind: "MAIN" | "SIDE" | "PERSONAL";
  status: "ACTIVE" | "COMPLETE" | "ABANDONED";
  title: string;
  summary: string;
  actIndex: number | null;
  secretForCharacterId: string | null;
  secretForName: string | null;
  objectives: QuestObjectiveView[];
};

const STATUS_STYLES: Record<QuestView["status"], string> = {
  ACTIVE: "border-hearth-800/60 bg-hearth-900/20",
  COMPLETE: "border-moss-800/50 bg-moss-900/10",
  ABANDONED: "border-hearth-800/40 bg-hearth-950/40",
};

/** A personal quest is marked so it never reads as something the party owes. */
function QuestBadge({ quest }: { quest: QuestView }) {
  if (quest.kind === "SIDE") {
    return (
      <span className="rounded-full border border-hearth-700/50 bg-hearth-800/40 px-2 py-0.5 text-xs text-hearth-300">
        side quest
      </span>
    );
  }

  if (quest.kind === "PERSONAL") {
    return (
      <span className="rounded-full border border-hearth-500/50 bg-hearth-600/20 px-2 py-0.5 text-xs text-hearth-200">
        {/* Once it is finished the whole table can see it, so it has to say
            whose it was — otherwise the reveal has no name on it. */}
        {quest.status === "ACTIVE"
          ? "just for you"
          : `${quest.secretForName ?? "somebody"}'s own`}
      </span>
    );
  }

  return null;
}

/**
 * The quest board.
 *
 * Deliberately says what happened rather than only what is left: an objective
 * that was met reads "Wren found the brass key", and one that was spent to
 * finish the quest says so. A tracker that quietly ticks a box throws away the
 * only part a child cares about.
 */
export function QuestList({ quests, compact = false }: { quests: QuestView[]; compact?: boolean }) {
  if (quests.length === 0) {
    return (
      <p className="text-sm text-hearth-400">
        Nothing on the board yet. The first chapter opens one as soon as the story begins.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {quests.map((quest) => {
        const done = quest.objectives.filter((objective) => objective.done).length;

        return (
          <li key={quest.id} className={`rounded-lg border p-3 ${STATUS_STYLES[quest.status]}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={
                  quest.status === "COMPLETE"
                    ? "text-moss-400"
                    : quest.status === "ABANDONED"
                      ? "text-hearth-600"
                      : "text-hearth-500"
                }
                aria-hidden
              >
                {quest.status === "COMPLETE" ? "✓" : quest.status === "ABANDONED" ? "—" : "○"}
              </span>
              <span className="font-display min-w-0 flex-1 text-hearth-100">{quest.title}</span>
              <QuestBadge quest={quest} />
              <span className="text-sm text-hearth-400">
                {quest.status === "COMPLETE"
                  ? "done"
                  : quest.status === "ABANDONED"
                    ? "left behind"
                    : `${done} of ${quest.objectives.length}`}
              </span>
            </div>

            {compact ? null : <p className="mt-1 text-sm text-hearth-200/60">{quest.summary}</p>}

            <ul className="mt-2 space-y-1">
              {quest.objectives.map((objective) => (
                <li key={objective.id} className="flex gap-2 text-sm">
                  <span
                    className={objective.done ? "text-moss-400" : "text-hearth-600"}
                    aria-hidden
                  >
                    {objective.done ? "✓" : "○"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={objective.done ? "text-hearth-300" : "text-hearth-200/80"}>
                      {objective.text}
                    </span>
                    {/* Only while it is still outstanding. Once it is found,
                        what would have counted is a footnote about the past. */}
                    {!objective.done && objective.counts.length > 0 ? (
                      <span className="block text-xs text-hearth-500">
                        It does not have to be worded like that — anything with{" "}
                        {objective.counts.slice(0, 4).join(", ")} in its name will count.
                      </span>
                    ) : null}
                    {objective.done && objective.foundByName ? (
                      <span className="block text-hearth-500">
                        {objective.foundByName} found{" "}
                        {objective.itemName && objective.itemName !== objective.text
                          ? objective.itemName
                          : "it"}
                        {objective.consumed ? " · given up to finish this" : ""}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** The one-line version for the top of the table. */
export function QuestSummaryLink({
  campaignId,
  quests,
}: {
  campaignId: string;
  quests: QuestView[];
}) {
  const active = quests.filter((quest) => quest.status === "ACTIVE");
  const outstanding = active.reduce(
    (count, quest) => count + quest.objectives.filter((objective) => !objective.done).length,
    0,
  );

  return (
    <Link href={`/campaigns/${campaignId}/finds`} className="underline hover:text-hearth-300">
      {outstanding > 0
        ? `${outstanding} ${outstanding === 1 ? "thing" : "things"} still to do`
        : "the quest board"}
    </Link>
  );
}
