"use client";

import { useActionState } from "react";
import { chooseForkAction } from "@/lib/game/fork-actions";
import type { FormState } from "@/lib/auth/actions";
import { Alert } from "@/components/ui";

export type ForkView = {
  id: string;
  whereA: string;
  whyA: string;
  whereB: string;
  whyB: string;
};

/**
 * The turning between two chapters.
 *
 * Deliberately the only thing on screen that can be pressed. The story waits
 * here, and a compose box sitting under this would say the choice was optional
 * — which is exactly what it is not.
 *
 * Two cards rather than a dropdown, sized so a nine-year-old can lean over and
 * jab one. The argument between two sisters over which to press is the point of
 * the whole feature; the interface should make taking a side easy and make
 * abstaining impossible.
 */
export function Fork({ fork }: { fork: ForkView }) {
  const [state, action] = useActionState<FormState, FormData>(chooseForkAction, null);

  return (
    <section className="mb-8 rounded-xl border border-hearth-600/60 bg-hearth-900/50 p-5">
      <p className="text-xs tracking-[0.15em] text-hearth-400 uppercase">Which way?</p>
      <h2 className="font-display mt-1 mb-1 text-2xl text-hearth-50">
        The road goes two ways from here
      </h2>
      <p className="mb-4 text-sm text-hearth-300/80">
        Talk it over. Whoever presses first decides for everybody, so agree before you do.
      </p>

      {state?.error ? <Alert>{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { choice: "A", where: fork.whereA, why: fork.whyA },
            { choice: "B", where: fork.whereB, why: fork.whyB },
          ] as const
        ).map((option) => (
          <form key={option.choice} action={action}>
            <input type="hidden" name="forkId" value={fork.id} />
            <input type="hidden" name="choice" value={option.choice} />
            <button
              type="submit"
              className="block h-full w-full rounded-lg border border-hearth-700 bg-hearth-950/40 p-4 text-left transition-colors hover:border-hearth-500 hover:bg-hearth-800/40"
            >
              <span className="font-display block text-lg text-hearth-100">{option.where}</span>
              <span className="mt-1 block text-sm text-hearth-300/80">{option.why}</span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

/**
 * What they chose, once they have chosen — for the chapter card and the journal.
 *
 * Worth showing afterwards as well as before. A family that can look back and
 * see the road they picked is a family whose choices left a mark, which is the
 * whole reason for asking.
 */
export function RoadTaken({ where, why }: { where: string; why: string }) {
  return (
    <p className="mt-3 text-sm text-hearth-300">
      <span className="text-hearth-500">You chose: </span>
      <span className="text-hearth-100">{where}</span>
      <span className="text-hearth-400"> — {why}</span>
    </p>
  );
}
