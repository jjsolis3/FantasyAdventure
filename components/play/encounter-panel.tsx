"use client";

import { ENCOUNTER_REACH } from "@/lib/game/encounters";

/**
 * What is standing in front of them.
 *
 * Written as a *situation* rather than a stat block, because a stat block is
 * how a game about talking your way out of trouble accidentally becomes a game
 * about numbers. There is no health here and nothing to whittle down — there is
 * somebody who wants something, some things that tend to work on them, and a
 * door.
 *
 * The one number is the track, and it is drawn rather than written: a row of
 * marks with a middle, filling toward "we are through this" on one side and
 * "this is going badly" on the other. Both ends are an ending and neither is a
 * loss, which is exactly what the act clock taught them already.
 */

export type EncounterView = {
  name: string;
  want: string;
  kind: "PERSON" | "TRAP" | "PUZZLE";
  works: string[];
  backfires: string[];
  wayOut: string;
  ground: number;
  /** Set when somebody has said she is handling it herself. */
  soloName: string | null;
};

const KIND_LABEL: Record<EncounterView["kind"], string> = {
  PERSON: "Somebody is in the way",
  TRAP: "You are in a fix",
  PUZZLE: "Something to work out",
};

export function EncounterPanel({ encounter }: { encounter: EncounterView }) {
  const { ground } = encounter;
  const winning = ground > 0;
  const losing = ground < 0;

  return (
    <div
      className={`rounded-xl border p-4 ${
        losing ? "border-red-800/60 bg-red-950/20" : "border-hearth-700/60 bg-hearth-900/30"
      }`}
    >
      <p className="text-xs uppercase tracking-widest text-hearth-500">
        {KIND_LABEL[encounter.kind]}
      </p>
      <h3 className="font-display mt-0.5 text-lg text-hearth-100">{encounter.name}</h3>
      <p className="mt-1 text-sm text-hearth-300">
        <span className="text-hearth-500">It wants:</span> {encounter.want}
      </p>

      {/* The track. Middle marked, so "we are one up" is something you can see
          rather than something you have to be told. */}
      <div className="mt-4 flex items-center gap-1" aria-label={`Going ${ground > 0 ? "well" : ground < 0 ? "badly" : "either way"}`}>
        {Array.from({ length: ENCOUNTER_REACH * 2 + 1 }, (_, index) => {
          const at = index - ENCOUNTER_REACH;
          const middle = at === 0;
          const filled = at !== 0 && (at > 0 ? ground >= at : ground <= at);

          return (
            <span
              key={at}
              className={`h-2.5 flex-1 rounded-full ${
                middle
                  ? "max-w-1 bg-hearth-600"
                  : filled
                    ? at > 0
                      ? "bg-moss-400"
                      : "bg-red-400"
                    : "bg-hearth-800"
              }`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-hearth-600">
        <span>it turns</span>
        <span
          className={
            winning ? "text-moss-400" : losing ? "text-red-300" : "text-hearth-500"
          }
        >
          {winning
            ? `${ground} ahead`
            : losing
              ? `${Math.abs(ground)} against you`
              : "either way"}
        </span>
        <span>you&apos;re through</span>
      </div>

      {encounter.works.length > 0 ? (
        <p className="mt-3 text-sm text-moss-400/90">
          <span className="text-hearth-500">Seems to help:</span> {encounter.works.join(", ")}
        </p>
      ) : null}
      {encounter.backfires.length > 0 ? (
        <p className="mt-1 text-sm text-rose-300/80">
          <span className="text-hearth-500">Makes it worse:</span> {encounter.backfires.join(", ")}
        </p>
      ) : null}

      {/* Always shown, never buried. A child who has decided she has had enough
          of this must be able to see that leaving is a real move. */}
      <p className="mt-3 border-t border-hearth-800/60 pt-3 text-sm text-hearth-400">
        <span className="text-hearth-500">You could always leave:</span> {encounter.wayOut}
      </p>

      {encounter.soloName ? (
        <p className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
          {encounter.soloName} has this one. Double experience to her — and nobody else is
          helping.
        </p>
      ) : null}
    </div>
  );
}

/**
 * "I've got this."
 *
 * Sits beside where she types her action, so the choice is made before the dice
 * and in front of everybody. Deliberately worded as a boast rather than as a
 * setting: it is a thing a ten-year-old says across a table, and it should read
 * like one.
 */
export function GoingAlone({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="mt-2 flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-hearth-200">I&apos;ve got this one</span>
        <span className="block text-xs text-hearth-500">
          Double experience if you get through it on your own — and no help, and no bond.
        </span>
      </span>
    </label>
  );
}
