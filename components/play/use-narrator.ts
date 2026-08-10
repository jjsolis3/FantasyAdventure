"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reading the story out loud.
 *
 * The browser's own speech synthesis rather than a cloud voice, and not as a
 * placeholder for one. A five-year-old who cannot read yet is exactly the player
 * this game is for, and what they need is for the storyteller to start talking
 * the moment the words arrive — not two seconds later, not only when the
 * internet is having a good day, and not at a penny a paragraph. Every phone
 * and laptop at the table already has a decent voice in it, chosen by whoever
 * set the device up, and it costs nothing and sends nothing anywhere.
 *
 * The text stays on screen throughout. This reads along with the page; it does
 * not replace it.
 */

const STORAGE_KEY = "hearthlight:narrator";

type Stored = { on: boolean; voiceURI: string | null; rate: number };

const DEFAULTS: Stored = { on: false, voiceURI: null, rate: 0.95 };

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Stored>) };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Splits narration into pieces a speech engine will actually finish.
 *
 * Chrome stops mid-sentence on utterances longer than about fifteen seconds, a
 * bug old enough to vote. Feeding it a sentence at a time sidesteps it entirely
 * and has a second benefit: stopping is instant, because only the sentence in
 * flight has to be abandoned.
 */
export function intoSpeakableChunks(text: string, limit = 220): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    // A sentence longer than the limit is broken at a comma rather than mid-word.
    if (sentence.length <= limit) {
      chunks.push(sentence);
      continue;
    }

    let rest = sentence;
    while (rest.length > limit) {
      const cut = rest.lastIndexOf(",", limit);
      const at = cut > limit / 2 ? cut + 1 : rest.lastIndexOf(" ", limit);
      const take = at > 0 ? at : limit;
      chunks.push(rest.slice(0, take).trim());
      rest = rest.slice(take).trim();
    }
    if (rest) chunks.push(rest);
  }

  return chunks;
}

export type Narrator = ReturnType<typeof useNarrator>;

export function useNarrator() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [rate, setRateState] = useState(DEFAULTS.rate);
  const [voiceURI, setVoiceURIState] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  /** The last passage handed over, so the same one is never read twice. */
  const spoken = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    const stored = read();
    setOn(stored.on);
    setRateState(stored.rate);
    setVoiceURIState(stored.voiceURI);

    // Chrome populates the list asynchronously and reports nothing at all on
    // the first call, so the event matters as much as the initial read.
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const save = useCallback((next: Partial<Stored>) => {
    const merged = { ...read(), ...next };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  /** Reads a passage now, whatever the toggle says. Used by the replay button. */
  const say = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;

      window.speechSynthesis.cancel();

      const chosen = voiceURI
        ? window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceURI)
        : undefined;

      const chunks = intoSpeakableChunks(text);
      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = rate;
        if (chosen) {
          utterance.voice = chosen;
          utterance.lang = chosen.lang;
        }
        if (index === 0) utterance.onstart = () => setSpeaking(true);
        if (index === chunks.length - 1) {
          utterance.onend = () => setSpeaking(false);
          utterance.onerror = () => setSpeaking(false);
        }
        window.speechSynthesis.speak(utterance);
      });

      spoken.current = text;
    },
    [supported, voiceURI, rate],
  );

  /**
   * Reads a passage if reading aloud is on and this passage has not been read.
   *
   * Both the browser running the turn and the ones watching call this — the
   * first when the narration arrives down the stream, the rest when it appears
   * in the refreshed transcript — and only one of them can be first. Comparing
   * the text itself is what keeps the story from being read twice at the table.
   */
  const speakOnce = useCallback(
    (text: string) => {
      if (!on || !text.trim() || spoken.current === text) return;
      say(text);
    },
    [on, say],
  );

  /** Marks a passage as already heard, without reading it. */
  const markSpoken = useCallback((text: string | null) => {
    spoken.current = text;
  }, []);

  /**
   * Switching on has to happen inside a real press.
   *
   * iOS refuses speech that was not started by a gesture, and silently — the
   * utterance is accepted and nothing comes out. Speaking a word of
   * acknowledgement from within the click both proves it works and unlocks the
   * rest of the session.
   */
  const enable = useCallback(() => {
    setOn(true);
    save({ on: true });
    if (supported) window.speechSynthesis.speak(new SpeechSynthesisUtterance("Right then."));
  }, [save, supported]);

  const disable = useCallback(() => {
    setOn(false);
    save({ on: false });
    stop();
  }, [save, stop]);

  const setVoice = useCallback(
    (uri: string | null) => {
      setVoiceURIState(uri);
      save({ voiceURI: uri });
      stop();
    },
    [save, stop],
  );

  const setRate = useCallback(
    (next: number) => {
      setRateState(next);
      save({ rate: next });
    },
    [save],
  );

  return {
    supported,
    on,
    speaking,
    voices,
    voiceURI,
    rate,
    enable,
    disable,
    say,
    speakOnce,
    markSpoken,
    stop,
    setVoice,
    setRate,
  };
}
