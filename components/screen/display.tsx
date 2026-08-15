"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  /** The act's clock. `level` is 0 until it has moved, and then nothing draws. */
  pressure: { name: string; level: number; limit: number };
  awaitingRolls: { characterName: string; intent: string }[];
  encounter: {
    name: string;
    want: string;
    ground: number;
    reach: number;
    soloName: string | null;
  } | null;
  /** The question the passage left the room with, and what it put in reach. */
  whatNow: string | null;
  onTheTable: string[];
  known: { id: string; kind: string; content: string }[];
  needed: { id: string; quest: string; text: string; kind: string }[];
  talkNudge: string | null;
  rolls: {
    id: string;
    characterName: string;
    intent: string;
    total: number;
    target: number;
    outcome: string;
  }[];
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
    <div className="flex w-24 flex-col items-center gap-1.5 lg:w-28">
      <div className="h-16 w-16 overflow-hidden rounded-lg border-2 border-hearth-700 lg:h-20 lg:w-20">
        {/* eslint-disable-next-line @next/next/no-img-element -- an object URL
            for bytes already in memory. */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </div>
      <p className="text-center text-xs text-hearth-300 lg:text-sm">{face.label}</p>
    </div>
  );
}

/** The picture of the chapter. */
function SceneArt({ version, token }: { version: string; token: string | null }) {
  const url = useScreenImage(`/api/screen/scene-image?v=${encodeURIComponent(version)}`, token);
  if (!url) return null;

  // Capped rather than free-running. The rail holds four things now and the
  // picture is the one that would happily eat all of it.
  // eslint-disable-next-line @next/next/no-img-element -- as above.
  return (
    <img
      src={url}
      alt=""
      className="max-h-[40%] w-full shrink-0 rounded-2xl border border-hearth-800 object-cover"
    />
  );
}

/** The party along the bottom, one face each. */
function PartyStrip({ party, token }: { party: Party[]; token: string | null }) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-5 lg:gap-8">
      {party.map((member) => (
        <div key={member.characterId} className="flex w-24 flex-col items-center gap-1.5 lg:w-28">
          <div
            className={`relative h-16 w-16 overflow-hidden rounded-full border-4 lg:h-20 lg:w-20 ${
              member.waitingOn
                ? // The one piece of state a room needs to see at a glance:
                  // whose turn it still is. Everything else can be read.
                  "border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.5)]"
                : "border-hearth-700"
            }`}
          >
            <Portrait member={member} token={token} />
          </div>

          <p className="font-display text-lg text-hearth-100 lg:text-xl">{member.name}</p>
          <p className="text-xs text-hearth-500 lg:text-sm">
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

/**
 * The act's clock, sized for a room rather than a hand.
 *
 * Its own component rather than the play page's, because the two want opposite
 * things. The phone version explains itself — a child reading it alone needs to
 * know what it means. This one is read at four metres by people who already
 * know, so it is a name and some lamps going out and nothing else.
 */
function ScreenPressure({ name, level, limit }: { name: string; level: number; limit: number }) {
  if (level <= 0) return null;

  const full = level >= limit;
  const nearly = !full && level >= limit - 1;
  const colour = full ? "text-red-400" : nearly ? "text-amber-400" : "text-hearth-400";

  return (
    <div className="flex items-center gap-3" role="status" aria-label={`${name}: ${level} of ${limit}`}>
      <span className={`text-xl lg:text-2xl ${colour}`}>{name}</span>
      <span className="flex gap-1.5" aria-hidden>
        {Array.from({ length: limit }, (_, index) => (
          <span
            key={index}
            className={`h-3 w-3 rounded-full lg:h-4 lg:w-4 ${
              index < level
                ? full
                  ? "bg-red-400"
                  : nearly
                    ? "bg-amber-400"
                    : "bg-hearth-400"
                : "bg-hearth-800"
            }`}
          />
        ))}
      </span>
    </div>
  );
}


/**
 * The passage, made to fit a screen nobody can scroll.
 *
 * The complaint that produced this: *"the text is just long, and the TV view
 * does not scroll, so most of the passage is not accessible."* A television has
 * no scrollbar and nobody is going to drive one with a remote, so the passage
 * has to be made to fit rather than allowed to run off the bottom.
 *
 * Two levers, in that order. First shrink: step the type down from something
 * enormous towards something merely large, which handles nearly everything —
 * most passages are two or three paragraphs and land at a size that still reads
 * from a sofa. Only when it is still too tall at the smallest readable size
 * does it start dropping paragraphs from the top, oldest first, and it says so
 * when it does. Shrinking a little beats hiding anything; hiding the beginning
 * beats hiding the end, because the end is what they are answering.
 *
 * The measuring loop runs on every render and only ever moves in one direction
 * per pass, so it converges: shrink, re-measure, shrink again, stop.
 */
const PASSAGE_MAX_PX = 40;
const PASSAGE_MIN_PX = 18;
/**
 * A hard stop on the measuring loop.
 *
 * The first version of this stepped the type down two pixels at a time and
 * started again from the top after every dropped paragraph, and React killed it
 * — "maximum update depth exceeded", a blank screen and an error card on a
 * television. Sizing by ratio settles in two or three passes rather than thirty,
 * and this budget is the backstop: if some layout ever refuses to settle, the
 * passage stays a little wrong instead of taking the whole wall down with it.
 */
const PASSAGE_PASSES = 24;

function Passage({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState(PASSAGE_MAX_PX);
  const [dropped, setDropped] = useState(0);
  /** The smallest size already measured as too tall. Stops grow/shrink flapping. */
  const ceiling = useRef(PASSAGE_MAX_PX + 1);
  const passes = useRef(0);

  const paragraphs = useMemo(
    () =>
      text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
    [text],
  );

  // A new passage starts again from the top, at full size. Without this a long
  // one would leave the type small for every passage after it.
  useLayoutEffect(() => {
    setSize(PASSAGE_MAX_PX);
    setDropped(0);
    ceiling.current = PASSAGE_MAX_PX + 1;
    passes.current = 0;
  }, [text]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const body = textRef.current;
    if (!box || !body || body.offsetHeight === 0) return;
    if (passes.current >= PASSAGE_PASSES) return;

    // The text is measured directly rather than through the box, because a box
    // never reports a scrollHeight smaller than itself — so slack is invisible
    // from the outside, and the first version of this could shrink but never
    // grow back. The marker is subtracted rather than scaled: it is a fixed
    // size and does not follow the passage down.
    const room = box.clientHeight - (markerRef.current?.offsetHeight ?? 0);
    const ideal = Math.max(
      PASSAGE_MIN_PX,
      Math.min(PASSAGE_MAX_PX, Math.floor((size * room) / body.offsetHeight)),
    );

    // A pixel of slack: sub-pixel line heights make an exactly-fitting box
    // measure one taller than itself and shrink forever.
    if (body.offsetHeight > room + 1) {
      ceiling.current = Math.min(ceiling.current, size);
      passes.current += 1;

      if (ideal < size) {
        setSize(ideal);
        return;
      }
      // Nothing left to give: it is at the smallest readable size and still too
      // tall. Drop the oldest paragraph — never the last one, because letting
      // one clip beats showing nothing at all.
      if (dropped < paragraphs.length - 1) {
        setDropped((current) => current + 1);
        // Everything measured so far was measured against more text, so the
        // ceiling no longer means anything. Forgetting it is what lets the
        // remaining paragraphs grow into the space the dropped one gave up.
        ceiling.current = PASSAGE_MAX_PX + 1;
      }
      return;
    }

    // It fits, with room to spare. Take the room, but never go back to a size
    // already proven too tall.
    if (ideal > size && ideal < ceiling.current) {
      passes.current += 1;
      setSize(ideal);
    }
  });

  const shown = paragraphs.slice(dropped);

  return (
    <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden">
      {dropped > 0 ? (
        <p ref={markerRef} className="mb-2 text-base tracking-widest text-hearth-600 uppercase">
          …earlier in this scene
        </p>
      ) : null}
      <div
        ref={textRef}
        className="space-y-4 text-hearth-200"
        style={{ fontSize: `${size}px`, lineHeight: 1.45 }}
      >
        {shown.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

/** One panel in the right-hand rail. Titled, quiet, and never taller than its share. */
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-0 overflow-hidden rounded-xl border border-hearth-800/70 bg-hearth-900/25 px-5 py-4">
      <h2 className="mb-2 text-base tracking-widest text-hearth-600 uppercase lg:text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** How a roll went, in one word and one colour. */
const OUTCOME_WORDS: Record<string, { word: string; colour: string }> = {
  CRITICAL: { word: "brilliantly", colour: "text-moss-300" },
  SUCCESS: { word: "worked", colour: "text-moss-400" },
  COMPLICATION: { word: "sort of", colour: "text-amber-400" },
  FAILURE: { word: "no luck", colour: "text-red-400" },
};

function Rolls({ rolls }: { rolls: View["rolls"] }) {
  return (
    <ul className="space-y-1.5">
      {rolls.map((roll) => {
        const outcome = OUTCOME_WORDS[roll.outcome] ?? OUTCOME_WORDS.SUCCESS;
        return (
          <li key={roll.id} className="flex items-baseline gap-3 text-xl lg:text-2xl">
            <span className="font-display text-hearth-100">{roll.characterName}</span>
            <span className="truncate text-hearth-500">{roll.intent}</span>
            <span className="ml-auto shrink-0 tabular-nums text-hearth-400">
              {roll.total}/{roll.target}
            </span>
            <span className={`shrink-0 ${outcome.colour}`}>{outcome.word}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The dashboard.
 *
 * It used to be a passage in very large type with the quests underneath, and it
 * had the two faults a wall display can have: the passage was often longer than
 * the screen, and everything the game actually knew — what the party had
 * learned, what was still outstanding, what the dice had just said — was on a
 * phone or nowhere.
 *
 * So the room now gets the same briefing the players get, at four metres:
 *
 *   - **The passage**, fitted to its box rather than allowed to run off it.
 *   - **The question** it left them with, and the things it put within reach.
 *     This is what the girls are actually arguing about, so it sits directly
 *     under the passage in the warmest colour on the screen.
 *   - **A rail** down the right: the chapter's picture, what they still need,
 *     what they know, and the last few rolls.
 *   - **The party** along the bottom, with whoever the story is waiting on lit
 *     up — the one piece of state a room must read at a glance.
 *
 * A roll to be thrown or something standing in front of them takes the top of
 * the left column when either is happening, because in those moments that is
 * the only thing the room is looking at.
 */
function Paired({ view, token }: { view: View; token: string | null }) {
  const narration = view.scene?.narration ?? [];
  const latest = narration[narration.length - 1];
  const active = view.quests.filter((quest) => quest.status === "ACTIVE");
  const hasRail =
    (view.scene?.hasImage && token) ||
    view.needed.length > 0 ||
    view.known.length > 0 ||
    view.rolls.length > 0 ||
    active.length > 0;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-hearth-950 p-6 lg:p-10">
      <header className="flex shrink-0 items-baseline justify-between gap-6">
        <h1 className="font-display truncate text-3xl text-hearth-100 lg:text-4xl">
          {view.scene?.title ?? view.campaignTitle}
        </h1>
        <div className="flex shrink-0 items-baseline gap-6">
          {/* Beside the location rather than tucked below it. This is the thing
              the girls should be able to see from the sofa while they are
              arguing about what to do — that is the moment it is for. */}
          <ScreenPressure {...view.pressure} />
          <p className="text-xl text-hearth-500 lg:text-2xl">
            {view.scene?.location ?? view.storyline}
          </p>
        </div>
      </header>

      <div className="mt-6 flex min-h-0 flex-1 gap-8 lg:gap-10">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Above everything, and the biggest thing on the wall while it is
              there. This is the whole reason real dice belong on a television:
              instead of four people looking down at four phones, the room looks
              up and sees whose turn it is to throw. */}
          {view.awaitingRolls.length > 0 ? (
            <div className="mb-6 shrink-0 rounded-2xl border-2 border-moss-500/60 bg-moss-900/30 px-7 py-5">
              <p className="text-lg tracking-widest text-moss-400 uppercase lg:text-xl">
                {view.awaitingRolls.length === 1 ? "Waiting on a roll" : "Everybody roll"}
              </p>
              <ul className="mt-3 space-y-2">
                {view.awaitingRolls.map((roll, index) => (
                  <li key={index}>
                    <span className="font-display text-3xl text-hearth-50 lg:text-4xl">
                      {roll.characterName}
                    </span>
                    <span className="ml-4 text-xl text-hearth-400 lg:text-2xl">
                      — {roll.intent}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xl text-moss-400/80">Roll a d20 and say what you got.</p>
            </div>
          ) : null}

          {/* Under the roll and above the passage. While one of these is open it
              is the thing the whole room is looking at, and what it *wants* is
              the clue they are all trying to read. */}
          {view.encounter ? (
            <div className="mb-5 shrink-0 rounded-2xl border border-hearth-700/60 bg-hearth-900/40 px-7 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <span className="font-display text-2xl text-hearth-50 lg:text-3xl">
                  {view.encounter.name}
                </span>
                <span className="text-lg text-hearth-400 lg:text-xl">
                  wants {view.encounter.want}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-1.5" aria-hidden>
                {Array.from({ length: view.encounter.reach * 2 + 1 }, (_, index) => {
                  const at = index - view.encounter!.reach;
                  const middle = at === 0;
                  const filled =
                    at !== 0 &&
                    (at > 0 ? view.encounter!.ground >= at : view.encounter!.ground <= at);

                  return (
                    <span
                      key={at}
                      className={`h-3 flex-1 rounded-full ${
                        middle
                          ? "max-w-1.5 bg-hearth-600"
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

              {view.encounter.soloName ? (
                <p className="mt-3 text-lg text-amber-400 lg:text-xl">
                  {view.encounter.soloName} has this one.
                </p>
              ) : null}
            </div>
          ) : null}

          {latest ? (
            <Passage key={latest.id} text={latest.text} />
          ) : (
            <p className="font-display flex-1 text-3xl text-hearth-500">
              The story is about to begin…
            </p>
          )}

          {/* The warmest thing on the screen, directly under the passage that
              raised it. This is what the room is arguing about. */}
          {view.whatNow ? (
            <p className="font-display mt-5 shrink-0 text-3xl text-amber-200 lg:text-4xl">
              {view.whatNow}
            </p>
          ) : null}

          {/* Nouns, not advice — see `lib/ai/schemas.ts`. Being told what is in
              the room is not being told what to do with it, and it is the
              difference between a table that is stuck and one that is deciding. */}
          {view.onTheTable.length > 0 ? (
            <ul className="mt-4 flex shrink-0 flex-wrap gap-3">
              {view.onTheTable.map((thing) => (
                <li
                  key={thing}
                  className="rounded-full border border-hearth-700/70 bg-hearth-900/40 px-5 py-1.5 text-xl text-hearth-100 lg:text-2xl"
                >
                  {thing}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Last in the column, under the question and the things in reach —
              the order a table would arrive at it in anyway. Addressed to the
              room rather than to a player, which is exactly what a television
              is for. */}
          {view.talkNudge ? (
            <p className="mt-4 shrink-0 text-xl text-moss-300 lg:text-2xl">{view.talkNudge}</p>
          ) : null}
        </div>

        {hasRail ? (
          <aside className="flex w-[30%] min-w-0 shrink-0 flex-col gap-4 overflow-hidden">
            {view.scene?.hasImage && token ? <SceneArt version={view.version} token={token} /> : null}

            {view.needed.length > 0 ? (
              <Card title="What we need">
                <ul className="space-y-1.5">
                  {view.needed.slice(0, 3).map((objective) => (
                    <li key={objective.id} className="text-xl text-hearth-200 lg:text-2xl">
                      {objective.text}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : active.length > 0 ? (
              <Card title="Working on">
                <ul className="space-y-1.5">
                  {active.slice(0, 3).map((quest) => (
                    <li key={quest.id} className="text-xl text-hearth-200 lg:text-2xl">
                      {quest.title}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {view.known.length > 0 ? (
              <Card title="What we know">
                <ul className="space-y-1.5">
                  {view.known.slice(0, 3).map((fact) => (
                    <li key={fact.id} className="text-lg text-hearth-300 lg:text-xl">
                      {fact.content}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {view.rolls.length > 0 ? (
              <Card title="Last rolls">
                <Rolls rolls={view.rolls.slice(-3)} />
              </Card>
            ) : null}
          </aside>
        ) : null}
      </div>

      <footer className="mt-6 shrink-0 border-t border-hearth-800 pt-5">
        {/* Whoever is in the scene, beside the party — they are the thing that
            changed, and the party is always there. */}
        <div className="flex flex-wrap items-end justify-center gap-8 lg:gap-12">
          <PartyStrip party={view.party} token={token} />
          {view.faces.length > 0 ? (
            <div className="flex flex-wrap items-start justify-center gap-5">
              {view.faces.map((face) => (
                <Face key={face.pictureId} face={face} token={token} />
              ))}
            </div>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
