"use client";

import { useEffect, useRef, useState } from "react";
import { TABLE_DIE, type AwaitedRoll } from "@/lib/game/table-dice";

/**
 * "Mira, roll your d20."
 *
 * The moment this whole feature exists for. The storyteller has decided what is
 * uncertain, and now the app stops talking and the table takes over: somebody
 * picks up a die, everybody watches it land, and the number goes in.
 *
 * Written to be read across a table rather than by one person holding a phone.
 * The name is the biggest thing on it, because the first question in the room
 * is always *whose turn is it to roll* — and the intent is right underneath,
 * because the second question is *for what?*
 *
 * There is deliberately nothing here that checks up on anybody. No timer, no
 * "are you sure", no clever guard against a number that looks too good. Four
 * people can see the die; that is a better check than anything that could be
 * written here, and a game that treats its players as suspects is not one this
 * family should be playing.
 */
export function RollPanel({
  awaited,
  onSubmit,
  onCancel,
  busy = false,
  error,
}: {
  awaited: AwaitedRoll[];
  onSubmit: (rolls: { index: number; value: number }[]) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState<Record<number, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);

  // Focus the first box when the ask arrives, so the number can be typed
  // without hunting — one hand still holding the die.
  useEffect(() => {
    firstRef.current?.focus();
  }, [awaited.length]);

  if (awaited.length === 0) return null;

  const entries = awaited.map((roll) => ({ roll, raw: values[roll.index] ?? "" }));
  const parsed = entries.map(({ roll, raw }) => ({
    index: roll.index,
    value: Number(raw),
    ok: /^\d+$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= TABLE_DIE,
  }));
  const ready = parsed.every((entry) => entry.ok);

  return (
    <div className="rounded-xl border border-moss-600/50 bg-moss-900/20 p-4">
      <h3 className="font-display text-lg text-moss-300">
        {awaited.length === 1 ? "Roll the dice" : "Everybody roll"}
      </h3>
      <p className="mt-0.5 text-sm text-hearth-300/80">
        One d{TABLE_DIE} each. Type in what it says — the rest of the sums are ours.
      </p>

      <div className="mt-4 space-y-3">
        {entries.map(({ roll, raw }, position) => {
          const entry = parsed[position];
          const typed = raw.trim().length > 0;

          return (
            <div
              key={roll.index}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-hearth-800/60 bg-hearth-950/40 p-3"
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <p className="font-display text-hearth-100">{roll.characterName}</p>
                <p className="text-sm text-hearth-400">{roll.intent}</p>
              </div>

              <label className="ml-auto flex items-center gap-2">
                <span className="text-sm text-hearth-500">d{TABLE_DIE}</span>
                <input
                  ref={position === 0 ? firstRef : undefined}
                  // Not type="number": the spinner arrows invite a child to
                  // click their way to a better result, and on a phone the
                  // numeric keypad is what actually matters.
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  value={raw}
                  disabled={busy}
                  aria-label={`What ${roll.characterName} rolled`}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [roll.index]: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  className={`h-12 w-16 rounded-lg border bg-hearth-950 text-center font-mono text-xl text-hearth-100 disabled:opacity-50 ${
                    typed && !entry.ok ? "border-rose-700" : "border-hearth-700"
                  }`}
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Only once something has actually been typed. Telling a child the
          number is wrong before she has finished typing it is how a keypad
          teaches her that she is bad at this. */}
      {entries.some(({ raw }, index) => raw.trim().length > 0 && !parsed[index].ok) ? (
        <p className="mt-3 text-sm text-rose-300">
          A d{TABLE_DIE} shows 1 to {TABLE_DIE}. Did you pick up the right one?
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onSubmit(parsed.map(({ index, value }) => ({ index, value })))}
          className="rounded-lg bg-moss-600 px-5 py-2.5 font-medium text-hearth-50 transition-colors hover:bg-moss-500 disabled:opacity-40"
        >
          {busy ? "Telling the story…" : "That's what we rolled"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-40"
        >
          a die went under the sofa — start this bit again
        </button>
      </div>
    </div>
  );
}
