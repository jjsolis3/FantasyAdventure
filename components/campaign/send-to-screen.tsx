"use client";

import { useState } from "react";

/**
 * Puts this adventure on a television.
 *
 * The pairing is done from here rather than on the television for two reasons,
 * and both are about which device is in whose hands. This one has a keyboard,
 * so typing six characters is nothing; the television has a remote control,
 * where it would be a minute of arrow keys. And this one is already signed in
 * as somebody who can see the adventure, which is what makes it safe to hand
 * the adventure over — the television proves nothing about itself, and does not
 * have to.
 */

/**
 * Only what the list actually renders.
 *
 * The server knows when each television was adopted and when it last asked for
 * anything, and neither belongs here: a family wants to know which screens are
 * showing this and how to stop one, not to audit them. Leaving the timestamps
 * out also keeps `Date` off the boundary, where it would arrive as a string
 * from the API and a Date from the page and need reconciling for no benefit.
 */
type Screen = { id: string; label: string | null };

export function SendToScreen({
  campaignId,
  initialScreens,
}: {
  campaignId: string;
  initialScreens: Screen[];
}) {
  const [screens, setScreens] = useState<Screen[]>(initialScreens);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function pair(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/screens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, label: label.trim() || undefined }),
      });
      const body = (await response.json()) as { error?: string; screens?: Screen[] };

      if (!response.ok) {
        setError(body.error ?? "That did not work.");
        return;
      }

      setScreens(body.screens ?? []);
      setCode("");
      setLabel("");
      setOpen(false);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function unpair(screenId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/screens`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenId }),
      });
      const body = (await response.json()) as { screens?: Screen[] };
      if (response.ok) setScreens(body.screens ?? []);
    } catch {
      // Leaves the list as it was. The next page load will tell the truth.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {screens.length > 0 ? (
        <ul className="space-y-2">
          {screens.map((screen) => (
            <li
              key={screen.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-hearth-800 px-4 py-3"
            >
              <span className="text-hearth-200">
                {screen.label ?? "A screen"}
                <span className="ml-2 text-sm text-hearth-500">showing this adventure</span>
              </span>
              <button
                type="button"
                onClick={() => void unpair(screen.id)}
                disabled={busy}
                className="text-sm text-hearth-400 underline underline-offset-4 hover:text-hearth-200 disabled:opacity-50"
              >
                Stop
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form onSubmit={pair} className="space-y-3">
          <div>
            <label htmlFor="screen-code" className="block text-sm text-hearth-400">
              The code on the television
            </label>
            <input
              id="screen-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="K3M-9PQ"
              autoFocus
              // A code with no lower case, no words and a dash in the middle:
              // the keyboard should open in capitals and stay out of the way.
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-900 px-4 py-3 font-display text-2xl tracking-[0.15em] text-hearth-100 placeholder:text-hearth-700"
            />
          </div>

          <div>
            <label htmlFor="screen-label" className="block text-sm text-hearth-400">
              What to call it (optional)
            </label>
            <input
              id="screen-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Living room"
              maxLength={40}
              className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-900 px-4 py-2 text-hearth-100 placeholder:text-hearth-700"
            />
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="rounded-lg bg-hearth-200 px-4 py-2 font-medium text-hearth-950 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send it"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-lg px-4 py-2 text-hearth-400 hover:text-hearth-200"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-hearth-700 px-4 py-2 text-hearth-200 hover:border-hearth-600"
          >
            {screens.length > 0 ? "Send to another screen" : "Send to a screen"}
          </button>
          <p className="text-sm text-hearth-500">
            Open <span className="text-hearth-300">/screen</span> on a television and type the code
            it shows.
          </p>
        </div>
      )}
    </div>
  );
}
