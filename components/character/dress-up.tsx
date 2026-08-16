"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { saveLookAction } from "@/lib/game/wardrobe-actions";
import { SLOTS, WARDROBE, lookSentence, type Look, type SlotKey } from "@/lib/game/wardrobe";

/**
 * The dressing room.
 *
 * Built for a ten-year-old who plays Dress to Impress, which is a specific
 * design brief rather than a joke: she does not want to *describe* her
 * adventurer, she wants to *browse* and see what happens. So every slot is a
 * row of taps, the sentence at the top rewrites itself as she taps, and nothing
 * is saved until she says so.
 *
 * Live preview is why this is a client component. The whole appeal is the
 * feedback loop — tap the cloak, see the sentence change — and a version that
 * needed a round trip per choice would be a form, not a dressing room.
 *
 * Free text lives underneath each row rather than instead of it. A child who
 * wants a coat made of bees should get one, and she should not have to give up
 * the browsing to have it.
 */

/** Held per slot, so a typed answer and a tapped one cannot both be live. */
type Draft = Record<SlotKey, string>;

export function DressUp({
  characterId,
  characterName,
  initial,
  /** Things this adventurer has found that she could reasonably wear. */
  earned,
}: {
  characterId: string;
  characterName: string;
  initial: Look;
  earned: { slot: SlotKey; text: string; from: string }[];
}) {
  // `null` is the untouched state and `{ error: "" }` is a save that worked, so
  // "Saved." cannot appear on a form nobody has submitted yet.
  const [state, action, pending] = useActionState(saveLookAction, null);

  const [draft, setDraft] = useState<Draft>(() => {
    const start = {} as Draft;
    for (const slot of SLOTS) start[slot] = initial[slot] ?? "";
    return start;
  });

  const look: Look = {};
  for (const slot of SLOTS) if (draft[slot]) look[slot] = draft[slot];
  const sentence = lookSentence(look, characterName);

  function choose(slot: SlotKey, value: string) {
    // Tapping the chosen one again clears it. There is no "none of these"
    // button because there does not need to be one, and a slot she cannot
    // un-choose is a slot she will stop experimenting with.
    setDraft((current) => ({ ...current, [slot]: current[slot] === value ? "" : value }));
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="characterId" value={characterId} />

      {/* The whole point of the screen, and pinned so it never scrolls away:
          every tap below rewrites this line. */}
      <div className="sticky top-2 z-10 rounded-xl border border-hearth-700/60 bg-hearth-950/90 p-4 backdrop-blur">
        <p className="mb-1 text-xs tracking-wide text-hearth-500 uppercase">How they look</p>
        <p className="font-display text-lg text-hearth-100">
          {sentence || `${characterName} has not been dressed yet. Start anywhere.`}
        </p>
      </div>

      {state?.error ? <Alert>{state.error}</Alert> : null}

      {SLOTS.map((slot) => {
        const info = WARDROBE[slot];
        const mine = earned.filter((item) => item.slot === slot);
        const chosen = draft[slot];
        // Something she typed, or something she earned, that is not in the
        // catalogue — shown as a chosen chip of its own so a custom answer
        // never looks like nothing is selected.
        const offCatalogue = chosen && !info.options.includes(chosen) ? chosen : null;

        return (
          <fieldset key={slot}>
            <legend className="mb-1 text-xs tracking-wide text-hearth-400 uppercase">
              {info.label}
            </legend>
            <p className="mb-2 text-sm text-hearth-500">{info.question}</p>

            {/* What she actually won, first and marked. A cloak earned in
                chapter three beats any preset, and saying where it came from is
                most of why it is worth wearing. */}
            {mine.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-2">
                {mine.map((item) => (
                  <li key={item.text}>
                    <button
                      type="button"
                      onClick={() => choose(slot, item.text)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        chosen === item.text
                          ? "border-moss-500 bg-moss-900/40 text-moss-100"
                          : "border-moss-800/60 text-moss-300 hover:bg-moss-900/20"
                      }`}
                    >
                      {item.text}
                      <span className="ml-2 text-xs text-moss-500">{item.from}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="flex flex-wrap gap-2">
              {offCatalogue ? (
                <li>
                  <button
                    type="button"
                    onClick={() => choose(slot, offCatalogue)}
                    className="rounded-full border border-hearth-500 bg-hearth-800/60 px-3 py-1.5 text-sm text-hearth-50"
                  >
                    {offCatalogue}
                  </button>
                </li>
              ) : null}
              {info.options.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    onClick={() => choose(slot, option)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      chosen === option
                        ? "border-hearth-400 bg-hearth-700/60 text-hearth-50"
                        : "border-hearth-800/70 text-hearth-300 hover:bg-hearth-900/40"
                    }`}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>

            <input
              type="text"
              name={slot}
              value={chosen}
              maxLength={120}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [slot]: event.target.value }))
              }
              placeholder="…or type your own"
              className="mt-2 w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-sm text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
            />
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-hearth-600 px-5 py-2.5 font-medium text-hearth-50 hover:bg-hearth-500 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save how they look"}
        </button>
        {state !== null && state.error === "" && !pending ? (
          <span className="text-sm text-moss-400" aria-live="polite">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}
