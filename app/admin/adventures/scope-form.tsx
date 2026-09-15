"use client";

import { useActionState, useState } from "react";
import { setStorylineScopeAction, type ScopeFormState } from "@/lib/game/storyline-actions";
import { SubmitButton } from "@/components/submit-button";

export type HouseholdChoice = { id: string; name: string };

/**
 * Who an adventure is for.
 *
 * The only place `COMMUNITY` can be granted, and deliberately not a toggle on
 * the family's own save button. A story that reaches other people's children
 * should have had somebody look at it first — and the alternative, letting a
 * household publish and building moderation to catch it afterwards, is a much
 * bigger thing badly disguised as a smaller one.
 *
 * The household picker only appears for `HOUSEHOLD`, because that is the only
 * scope where the answer is a particular family. A shared adventure keeps its
 * author so the family who wrote it can still edit it; a shipped one has
 * genuinely nobody behind it.
 */
export function StorylineScopeForm({
  storylineId,
  title,
  scope,
  householdId,
  households,
}: {
  storylineId: string;
  title: string;
  scope: string;
  householdId: string | null;
  households: HouseholdChoice[];
}) {
  const [state, action] = useActionState<ScopeFormState, FormData>(setStorylineScopeAction, null);
  const [chosen, setChosen] = useState(scope);

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="storylineId" value={storylineId} />

      <select
        name="scope"
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
        aria-label={`Who ${title} is for`}
        className="rounded-md border border-hearth-700 bg-hearth-900/60 px-2 py-1 text-xs text-hearth-100"
      >
        <option value="SYSTEM">came with the game</option>
        <option value="HOUSEHOLD">one family&rsquo;s own</option>
        <option value="COMMUNITY">shared with every family</option>
      </select>

      {chosen === "SYSTEM" ? null : (
        <select
          name="householdId"
          defaultValue={householdId ?? households[0]?.id}
          aria-label={`Which family ${title} belongs to`}
          className="rounded-md border border-hearth-700 bg-hearth-900/60 px-2 py-1 text-xs text-hearth-100"
        >
          {households.map((household) => (
            <option key={household.id} value={household.id}>
              {household.name}
            </option>
          ))}
        </select>
      )}

      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save who it is for
      </SubmitButton>

      {state ? (
        <span
          role="status"
          className={`text-sm ${state.error ? "text-amber-300" : "text-moss-400"}`}
        >
          {state.error || state.done}
        </span>
      ) : null}
    </form>
  );
}
