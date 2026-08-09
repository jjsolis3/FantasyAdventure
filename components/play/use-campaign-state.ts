"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoundView } from "@/lib/game/rounds";

export type CampaignState = {
  version: string;
  status: string;
  inputMode: string;
  turnCounter: number;
  round: RoundView | null;
};

/** Often enough that a turn appearing feels immediate at a family's pace. */
const VISIBLE_MS = 3_000;
/** A phone in a pocket is not a player waiting. */
const HIDDEN_MS = 20_000;

/**
 * Keeps this browser in step with the rest of the table.
 *
 * Polling, not a stream. A turn already holds one server-sent-events connection
 * open per browser for minutes at a time; adding a second permanent one per
 * watcher, through a proxy and possibly a tunnel, buys nothing for a table of
 * four people whose state changes every minute or two.
 *
 * `onChange` fires when something the page is rendering has actually changed —
 * a turn taken, somebody joining — so the caller can refetch the transcript
 * from the server rather than trying to assemble it here.
 */
export function useCampaignState(
  campaignId: string,
  options: { initialRound: RoundView | null; enabled?: boolean; onChange?: (state: CampaignState) => void },
) {
  const { initialRound, enabled = true } = options;

  const [state, setState] = useState<CampaignState | null>(null);
  const [round, setRound] = useState<RoundView | null>(initialRound);

  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const versionRef = useRef<string | null>(null);
  const pokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/state`, { cache: "no-store" });
        if (response.ok && live) {
          const data = (await response.json()) as CampaignState;
          setState(data);
          setRound(data.round);

          // Nothing fires on the first reply: the page was rendered from the
          // same data a moment ago, and refreshing it immediately would be a
          // loop that never settles.
          if (versionRef.current !== null && versionRef.current !== data.version) {
            onChangeRef.current?.(data);
          }
          versionRef.current = data.version;
        }
      } catch {
        // A dropped poll is not worth telling anybody about; the next one is
        // three seconds away, and the page is still showing the last truth.
      }

      if (live) {
        timer = setTimeout(tick, document.visibilityState === "hidden" ? HIDDEN_MS : VISIBLE_MS);
      }
    };

    pokeRef.current = () => {
      clearTimeout(timer);
      void tick();
    };

    void tick();

    const wake = () => {
      if (document.visibilityState === "visible") pokeRef.current?.();
    };
    document.addEventListener("visibilitychange", wake);

    return () => {
      live = false;
      clearTimeout(timer);
      pokeRef.current = null;
      document.removeEventListener("visibilitychange", wake);
    };
  }, [campaignId, enabled]);

  /** Asks now rather than waiting for the next tick. */
  const poke = useCallback(() => pokeRef.current?.(), []);

  /**
   * Takes the round straight from a mutation's reply, so the person who just
   * pressed a button does not watch their own answer appear three seconds late.
   *
   * The version is deliberately left alone: answers are not part of it, so
   * nothing here can be mistaken for the page needing to be refetched.
   */
  const applyRound = useCallback((next: RoundView | null) => setRound(next), []);

  return { state, round, applyRound, poke };
}
