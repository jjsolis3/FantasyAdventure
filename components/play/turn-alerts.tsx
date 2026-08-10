"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Telling a player that the table is waiting for them.
 *
 * Answering from your own device only works if you find out there is something
 * to answer. On one screen that was never a question — everybody was looking at
 * it. Apart, a round can sit open for an hour because three people are waiting
 * for a fourth who has no idea, which is a worse experience than passing one
 * laptop round the sofa.
 *
 * Three signals, deliberately in order of how much they interrupt:
 *
 *   - A line on the page, which is enough when somebody is looking at it.
 *   - The tab's title, which is enough when the page is one of nine tabs.
 *   - A notification, which is the only thing that reaches a phone face-down on
 *     the table — and is asked for rather than assumed.
 *
 * The honest limit: this needs the page open somewhere, even in the background.
 * Reaching a closed browser means push subscriptions and a service worker, and
 * that is a great deal of machinery for a family of five who are mostly in the
 * same house.
 */

const STORAGE_KEY = "hearthlight:notify-my-turn";

type Permission = "unsupported" | "default" | "granted" | "denied";

function currentPermission(): Permission {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission as Permission;
}

export function useTurnAlerts({
  waiting,
  storyMoved,
  campaignTitle,
  campaignId,
}: {
  /** True when a round is open and one of this player's adventurers has not answered. */
  waiting: boolean;
  /** Rises each time a turn is committed, so the story moving can be announced. */
  storyMoved: number;
  campaignTitle: string;
  campaignId: string;
}) {
  const [wanted, setWanted] = useState(false);
  const [permission, setPermission] = useState<Permission>("unsupported");

  useEffect(() => {
    setPermission(currentPermission());
    setWanted(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  // ---- The tab's title ------------------------------------------------------
  //
  // Captured once, before anything is added to it, so that a re-render cannot
  // leave the page called "● Your turn — ● Your turn — Hearthlight".
  const plainTitle = useRef<string | null>(null);
  useEffect(() => {
    plainTitle.current ??= document.title;
    document.title = waiting ? `● Your turn — ${plainTitle.current}` : plainTitle.current;

    return () => {
      if (plainTitle.current) document.title = plainTitle.current;
    };
  }, [waiting]);

  // ---- The notification -----------------------------------------------------
  const announced = useRef(false);
  useEffect(() => {
    if (!waiting) {
      // Ready to announce the next round. Without this, a player who answers
      // and then withdraws is never told again.
      announced.current = false;
      return;
    }
    if (announced.current || !wanted || permission !== "granted") return;
    // Somebody looking at the page can already see it; interrupting them as
    // well is how a helpful notification becomes one that gets switched off.
    if (document.visibilityState === "visible") return;

    announced.current = true;
    notify(`${campaignTitle} — it's your turn`, "The rest of the party is waiting for you.", campaignId);
  }, [waiting, wanted, permission, campaignTitle, campaignId]);

  const lastTurn = useRef<number | null>(null);
  useEffect(() => {
    const previous = lastTurn.current;
    lastTurn.current = storyMoved;

    if (previous === null || storyMoved <= previous) return;
    if (!wanted || permission !== "granted" || document.visibilityState === "visible") return;

    notify(`${campaignTitle} — the story moved on`, "A turn was taken while you were away.", campaignId);
  }, [storyMoved, wanted, permission, campaignTitle, campaignId]);

  async function askToBeTold() {
    if (typeof Notification === "undefined") return;

    // Asked from a real press, because a permission prompt that appears on page
    // load is the one everybody refuses on reflex.
    const result = (await Notification.requestPermission()) as Permission;
    setPermission(result);

    const on = result === "granted";
    setWanted(on);
    window.localStorage.setItem(STORAGE_KEY, String(on));
  }

  function stopBeingTold() {
    setWanted(false);
    window.localStorage.setItem(STORAGE_KEY, "false");
  }

  return { wanted, permission, askToBeTold, stopBeingTold };
}

function notify(title: string, body: string, tag: string) {
  try {
    // The tag means a second announcement about the same adventure replaces the
    // first rather than stacking up while somebody is out of the room.
    new Notification(title, { body, tag });
  } catch {
    // Some browsers refuse to construct one outside a service worker. The title
    // and the page still say it.
  }
}

/** The opt-in, and the only place the browser is ever asked for permission. */
export function TellMeToggle({
  wanted,
  permission,
  onAsk,
  onStop,
}: {
  wanted: boolean;
  permission: Permission;
  onAsk: () => void;
  onStop: () => void;
}) {
  if (permission === "unsupported") return null;

  if (permission === "denied") {
    return (
      <p className="text-sm text-hearth-500">
        This browser is set to refuse notifications, so the tab&rsquo;s title is the only nudge you
        will get.
      </p>
    );
  }

  return wanted && permission === "granted" ? (
    <button
      type="button"
      onClick={onStop}
      className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300"
    >
      Stop telling me when it&rsquo;s my turn
    </button>
  ) : (
    <button
      type="button"
      onClick={onAsk}
      className="text-sm text-hearth-500 underline underline-offset-4 hover:text-hearth-300"
    >
      Tell me when it&rsquo;s my turn
    </button>
  );
}
