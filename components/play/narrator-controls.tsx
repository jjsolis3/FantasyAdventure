"use client";

import type { Narrator } from "./use-narrator";

/**
 * The storyteller's voice, and the two things anybody ever wants to change
 * about it: which one, and how fast.
 *
 * Deliberately small and always in the same place. This is a control a child
 * reaches for mid-scene, not a settings page — and the one button that matters
 * is the one that stops it talking.
 */
export function NarratorControls({ narrator }: { narrator: Narrator }) {
  if (!narrator.supported) return null;

  // Voices are listed in dozens on some machines. English ones first and the
  // rest after, rather than hidden — a bilingual table is not a strange table.
  const voices = [...narrator.voices].sort((a, b) => {
    const aEnglish = a.lang.startsWith("en") ? 0 : 1;
    const bEnglish = b.lang.startsWith("en") ? 0 : 1;
    return aEnglish - bEnglish || a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hearth-800/60 bg-hearth-900/30 px-4 py-3">
      {narrator.on ? (
        <button
          type="button"
          onClick={narrator.disable}
          className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-200 hover:bg-hearth-800/50"
        >
          Stop reading aloud
        </button>
      ) : (
        <button
          type="button"
          onClick={narrator.enable}
          className="rounded-lg border border-hearth-700 px-3 py-1.5 text-sm text-hearth-200 hover:bg-hearth-800/50"
        >
          Read the story aloud
        </button>
      )}

      {narrator.speaking ? (
        <button
          type="button"
          onClick={narrator.stop}
          className="text-sm text-hearth-400 underline underline-offset-4 hover:text-hearth-200"
        >
          Quiet
        </button>
      ) : null}

      {narrator.on ? (
        <>
          <label className="flex items-center gap-2 text-sm text-hearth-400">
            Voice
            <select
              value={narrator.voiceURI ?? ""}
              onChange={(event) => narrator.setVoice(event.target.value || null)}
              className="max-w-[12rem] rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-2 py-1 text-hearth-100 focus:border-hearth-600 focus:outline-none"
            >
              <option value="" className="bg-hearth-950">
                This device&rsquo;s own
              </option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI} className="bg-hearth-950">
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-hearth-400">
            Speed
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={narrator.rate}
              onChange={(event) => narrator.setRate(Number(event.target.value))}
              aria-label="How fast the storyteller reads"
              className="w-24 accent-hearth-500"
            />
          </label>
        </>
      ) : (
        <p className="text-sm text-hearth-500">
          Uses the voice already on this device — nothing to set up, and it works on each screen
          separately.
        </p>
      )}
    </div>
  );
}
