"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useScreenImage } from "./use-screen-image";

/**
 * The television.
 *
 * Written for a room rather than a hand. Everything here is sized to be read
 * from a sofa: the narration is the largest text in the application by some
 * margin, the party is a strip of faces rather than a list of statistics, and
 * there is no navigation at all because nobody is going to drive this with a
 * remote control.
 *
 * It holds its token in localStorage, which is the one place a device with no
 * account can keep something across a power cut. That is also why the token is
 * worth so little on its own: see `lib/game/screen.ts`.
 */

const TOKEN_KEY = "hearthlight_screen_token";

/** How often the television asks whether anything has changed. */
const POLL_MS = 4000;
/** And how often while it is still waiting to be adopted, which is a moment
 *  somebody is actively standing in front of it for. */
const WAITING_POLL_MS = 2000;
/** A code is good for fifteen minutes; it is replaced a little before that, so
 *  the wall never shows one that has just stopped working. */
const CODE_REFRESH_MS = 13 * 60 * 1000;

type Party = {
  characterId: string;
  name: string;
  archetype: string;
  level: number;
  portraitVersion: number | null;
  waitingOn: boolean;
};

type View = {
  campaignTitle: string;
  storyline: string;
  tone: string;
  status: string;
  actIndex: number;
  scene: {
    title: string;
    location: string | null;
    narration: { id: string; text: string }[];
    hasImage: boolean;
  } | null;
  party: Party[];
  /** People the family drew who are in this scene. */
  faces: { pictureId: string; label: string; version: number }[];
  quests: { id: string; title: string; status: string }[];
  version: string;
};

type State =
  | { kind: "starting" }
  | { kind: "waiting"; code: string }
  | { kind: "paired"; view: View };

export function ScreenDisplay() {
  const [state, setState] = useState<State>({ kind: "starting" });
  const tokenRef = useRef<string | null>(null);
  // When the displayed code was issued, so a television left waiting all
  // evening can replace it before it goes stale.
  const codeIssuedRef = useRef<number>(0);

  /** Asks for a code, and keeps the token that comes with it. */
  const register = useCallback(async () => {
    const response = await fetch("/api/screen/register", { method: "POST" });
    if (!response.ok) return;
    const body = (await response.json()) as { code: string; token: string };

    tokenRef.current = body.token;
    codeIssuedRef.current = Date.now();
    window.localStorage.setItem(TOKEN_KEY, body.token);
    setState({ kind: "waiting", code: body.code });
  }, []);

  const poll = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;

    const response = await fetch("/api/screen/state", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    // The family unpaired this television, or it slept for a fortnight. Either
    // way the honest thing is to go back to asking for a code rather than to
    // sit there showing an adventure that is no longer ours.
    if (response.status === 404) {
      window.localStorage.removeItem(TOKEN_KEY);
      tokenRef.current = null;
      await register();
      return;
    }
    if (!response.ok) return;

    const body = (await response.json()) as
      | { state: "waiting" }
      | { state: "paired"; view: View };

    if (body.state === "waiting") {
      // The token is still good but nobody has adopted us. Two reasons to ask
      // for a fresh code: we are holding a token from a previous run and have
      // no code to show at all, or the one on the wall is about to stop
      // working. A code nobody can use is worse than no code, because somebody
      // will stand there typing it.
      const stale = Date.now() - codeIssuedRef.current > CODE_REFRESH_MS;
      setState((current) => {
        if (current.kind !== "waiting" || stale) {
          void register();
          return current;
        }
        return current;
      });
      return;
    }

    setState({ kind: "paired", view: body.view });
  }, [register]);

  // Startup: reuse the token this television already had, so a power cut does
  // not cost the family a second trip to the sofa with a phone.
  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) {
      tokenRef.current = saved;
      void poll();
    } else {
      void register();
    }
  }, [poll, register]);

  useEffect(() => {
    const waiting = state.kind === "waiting";
    const timer = setInterval(() => void poll(), waiting ? WAITING_POLL_MS : POLL_MS);
    return () => clearInterval(timer);
  }, [state.kind, poll]);

  // Wake locks are best-effort and unsupported in plenty of browsers. Asked for
  // anyway: a television that dims halfway through a chapter is the single most
  // annoying thing this display could do.
  useEffect(() => {
    if (state.kind !== "paired") return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        // No wake lock available. The family can set the television's own
        // sleep timer, and nothing else here depends on this.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [state.kind]);

  if (state.kind === "paired") return <Paired view={state.view} token={tokenRef.current} />;
  if (state.kind === "waiting") return <Waiting code={state.code} />;
  return <Splash>Waking up…</Splash>;
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-hearth-950 p-12">
      <p className="font-display text-4xl text-hearth-400">{children}</p>
    </main>
  );
}

/**
 * What a television shows before anybody has adopted it.
 *
 * The code is enormous on purpose — it is read from across a room, by somebody
 * holding a phone, quite possibly by a child doing the typing. Everything else
 * on this screen is instructions for that one job.
 */
function Waiting({ code }: { code: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-hearth-950 p-12 text-center">
      <p className="font-display text-3xl text-hearth-300 sm:text-4xl">
        To show an adventure here
      </p>

      <p
        className="font-display text-7xl tracking-[0.2em] text-hearth-50 sm:text-8xl lg:text-[9rem]"
        // Read aloud across a room as often as it is read off the screen, so it
        // is announced as one string rather than letter by letter.
        aria-label={`Pairing code ${code.split("").join(" ")}`}
      >
        {code}
      </p>

      <ol className="max-w-2xl space-y-3 text-2xl text-hearth-300 sm:text-3xl">
        <li>Open the adventure on your phone</li>
        <li>
          Tap <span className="text-hearth-100">Send to a screen</span>
        </li>
        <li>Type the code above</li>
      </ol>

      <p className="text-xl text-hearth-500">This code lasts fifteen minutes.</p>
    </main>
  );
}

/**
 * One adventurer's face, or her initial if nobody has drawn her yet.
 *
 * Its own component so each portrait can hold its own request. The version is
 * part of the path so that replacing a portrait replaces what is on the wall
 * rather than leaving yesterday's cached copy up.
 */
function Portrait({ member, token }: { member: Party; token: string | null }) {
  const url = useScreenImage(
    member.portraitVersion !== null
      ? `/api/screen/portrait/${member.characterId}?v=${member.portraitVersion}`
      : null,
    token,
  );

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-hearth-800 font-display text-4xl text-hearth-400">
        {member.name.slice(0, 1)}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- an object URL for
  // bytes already in memory; the image loader has nothing to add.
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

/**
 * A face somebody at this table drew, of somebody the party met.
 *
 * The nicest thing on this screen, and the reason the gallery exists: a
 * ten-year-old's felt-tip beekeeper, on the television, the same evening she
 * drew him.
 */
function Face({
  face,
  token,
}: {
  face: { pictureId: string; label: string; version: number };
  token: string | null;
}) {
  const url = useScreenImage(`/api/screen/face/${face.pictureId}?v=${face.version}`, token);
  if (!url) return null;

  return (
    <div className="flex w-28 flex-col items-center gap-2 lg:w-32">
      <div className="h-20 w-20 overflow-hidden rounded-lg border-2 border-hearth-700 lg:h-24 lg:w-24">
        {/* eslint-disable-next-line @next/next/no-img-element -- an object URL
            for bytes already in memory. */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </div>
      <p className="text-center text-sm text-hearth-300 lg:text-base">{face.label}</p>
    </div>
  );
}

/** The picture of the chapter. */
function SceneArt({ version, token }: { version: string; token: string | null }) {
  const url = useScreenImage(`/api/screen/scene-image?v=${encodeURIComponent(version)}`, token);
  if (!url) return null;

  // eslint-disable-next-line @next/next/no-img-element -- as above.
  return (
    <img src={url} alt="" className="w-full rounded-2xl border border-hearth-800 object-cover" />
  );
}

/** The party along the bottom, one face each. */
function PartyStrip({ party, token }: { party: Party[]; token: string | null }) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-6 lg:gap-10">
      {party.map((member) => (
        <div key={member.characterId} className="flex w-32 flex-col items-center gap-2 lg:w-40">
          <div
            className={`relative h-24 w-24 overflow-hidden rounded-full border-4 lg:h-32 lg:w-32 ${
              member.waitingOn
                ? // The one piece of state a room needs to see at a glance:
                  // whose turn it still is. Everything else can be read.
                  "border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.5)]"
                : "border-hearth-700"
            }`}
          >
            <Portrait member={member} token={token} />
          </div>

          <p className="font-display text-xl text-hearth-100 lg:text-2xl">{member.name}</p>
          <p className="text-sm text-hearth-500 lg:text-base">
            {member.waitingOn ? (
              <span className="text-amber-400">deciding…</span>
            ) : (
              `Level ${member.level}`
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

function Paired({ view, token }: { view: View; token: string | null }) {
  const narration = view.scene?.narration ?? [];
  const latest = narration[narration.length - 1];

  return (
    <main className="flex min-h-screen flex-col bg-hearth-950 p-8 lg:p-12">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="font-display text-3xl text-hearth-100 lg:text-4xl">
          {view.scene?.title ?? view.campaignTitle}
        </h1>
        <p className="text-xl text-hearth-500 lg:text-2xl">
          {view.scene?.location ?? view.storyline}
        </p>
      </header>

      <div className="mt-8 flex flex-1 flex-col gap-8 lg:flex-row lg:gap-12">
        {view.scene?.hasImage && token ? (
          <div className="lg:w-2/5">
            <SceneArt version={view.version} token={token} />
          </div>
        ) : null}

        <div className="flex flex-1 flex-col justify-center">
          {latest ? (
            // Only the most recent paragraph, at a size that carries across a
            // room. A television is not for catching up on what you missed —
            // that is the journal, on a phone, where you can scroll.
            <p className="text-3xl leading-relaxed text-hearth-200 lg:text-4xl lg:leading-relaxed">
              {latest.text}
            </p>
          ) : (
            <p className="font-display text-3xl text-hearth-500">
              The story is about to begin…
            </p>
          )}

          {view.quests.filter((quest) => quest.status === "ACTIVE").length > 0 ? (
            <div className="mt-10 border-t border-hearth-800 pt-6">
              <p className="text-lg uppercase tracking-widest text-hearth-600">Working on</p>
              <ul className="mt-3 space-y-2">
                {view.quests
                  .filter((quest) => quest.status === "ACTIVE")
                  .map((quest) => (
                    <li key={quest.id} className="text-2xl text-hearth-300">
                      {quest.title}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="mt-10 border-t border-hearth-800 pt-8">
        {/* Whoever is in the scene, above the party — they are the thing that
            changed, and the party is always there. */}
        {view.faces.length > 0 ? (
          <div className="mb-8 flex flex-wrap items-start justify-center gap-6">
            {view.faces.map((face) => (
              <Face key={face.pictureId} face={face} token={token} />
            ))}
          </div>
        ) : null}

        <PartyStrip party={view.party} token={token} />
      </footer>
    </main>
  );
}
