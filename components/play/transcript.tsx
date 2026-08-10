"use client";

import { useEffect, useRef, useState } from "react";
import { STAT_INFO } from "@/lib/game/rules";
import type { StatKey } from "@/lib/game/rules";

export type TranscriptEntry = {
  id: string;
  type: "NARRATION" | "PLAYER_ACTION" | "DICE_ROLL" | "SYSTEM";
  actorName?: string | null;
  content: string;
  dice?: DiceDetail | null;
  /** Said aloud rather than attempted — shown as speech, not as an action. */
  spoken?: boolean;
  /** Where a play session stopped, so returning to it reads as a resumption. */
  bookmark?: boolean;
};

export type DiceDetail = {
  characterName: string;
  stat: StatKey;
  difficulty: string;
  roll: number;
  modifier: number;
  skillBonus: number;
  total: number;
  target: number;
  outcome: "CRITICAL" | "SUCCESS" | "PARTIAL" | "COMPLICATION";
  intent: string;
  skillName?: string;
  /** Present when a Family Move altered this check. */
  move?: { moveName: string; note: string } | null;
};

const OUTCOME_STYLE: Record<DiceDetail["outcome"], { label: string; className: string }> = {
  CRITICAL: { label: "Critical success!", className: "border-moss-400/60 bg-moss-800/40 text-moss-400" },
  SUCCESS: { label: "Success", className: "border-moss-600/50 bg-moss-800/30 text-moss-400" },
  PARTIAL: { label: "Partly…", className: "border-hearth-500/50 bg-hearth-800/40 text-hearth-300" },
  COMPLICATION: { label: "Complication", className: "border-red-900/50 bg-red-950/30 text-red-300" },
};

/** One dice check, shown the way a table would read it aloud. */
export function DiceCard({ dice, animate = false }: { dice: DiceDetail; animate?: boolean }) {
  const style = OUTCOME_STYLE[dice.outcome];
  const bonus = dice.modifier + dice.skillBonus;

  // A short tumble before settling. Purely for the ten-year-olds, and skipped
  // entirely for rolls already in the transcript.
  const [shown, setShown] = useState(animate ? 1 : dice.roll);

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      if (frame > 8) {
        setShown(dice.roll);
        clearInterval(timer);
        return;
      }
      setShown(1 + Math.floor(Math.random() * 20));
    }, 70);
    return () => clearInterval(timer);
  }, [animate, dice.roll]);

  return (
    <div className={`rounded-lg border p-3 ${style.className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current font-mono text-lg ${
            animate && shown !== dice.roll ? "opacity-60" : ""
          }`}
          aria-label={`rolled ${dice.roll}`}
        >
          {shown}
        </span>
        <span className="font-medium">{style.label}</span>
        <span className="text-sm opacity-80">
          {dice.characterName} · {STAT_INFO[dice.stat]?.label ?? dice.stat}
          {dice.skillName ? ` + ${dice.skillName}` : ""}
          {bonus !== 0 ? ` (${bonus > 0 ? "+" : ""}${bonus})` : ""} · {dice.total} vs {dice.target}
        </span>
      </div>
      <p className="mt-1.5 text-sm opacity-80">{dice.intent}</p>

      {dice.move ? (
        <p className="mt-2 border-t border-current/20 pt-2 text-sm">
          <span className="font-medium">{dice.move.moveName}</span>
          <span className="opacity-80"> — {dice.move.note}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reveals text a few characters at a time, so narration feels written rather
 * than pasted. The full text has already passed the safety guard.
 *
 * `onDone` fires when the last character lands. The caller uses it to hand the
 * paragraph over to the transcript: until then the same words are on the page
 * twice — once here, once in the transcript the server has already committed
 * them to — and only this copy is the one being read.
 */
export function TypedNarration({
  text,
  speed = 12,
  onDone,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState("");

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setShown("");
    let index = 0;
    const timer = setInterval(() => {
      // Several characters per tick — one at a time is unbearably slow for a
      // 150-word paragraph.
      index = Math.min(index + 3, text.length);
      setShown(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(timer);
        onDoneRef.current?.();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return <NarrationBody text={shown} />;
}

export function NarrationBody({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split(/\n\s*\n/).map((paragraph, index) => (
        <p key={index} className="leading-relaxed text-hearth-100">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export function Transcript({
  entries,
  onSpeak,
}: {
  entries: TranscriptEntry[];
  /** Given when the device can read aloud, so a passage can be heard again. */
  onSpeak?: (text: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);

  return (
    <div className="space-y-5">
      {entries.map((entry) => {
        if (entry.type === "NARRATION") {
          return (
            <div key={entry.id} className="group font-display text-lg">
              <NarrationBody text={entry.content} />
              {onSpeak ? (
                // Quiet until wanted: a child asking "what did it say?" is the
                // whole use, and a loudspeaker beside every paragraph would
                // shout at everybody else all evening.
                <button
                  type="button"
                  onClick={() => onSpeak(entry.content)}
                  aria-label="Read this part again"
                  className="mt-1 font-sans text-sm text-hearth-600 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-hearth-300"
                >
                  ▸ read this again
                </button>
              ) : null}
            </div>
          );
        }

        if (entry.type === "PLAYER_ACTION") {
          return (
            <div key={entry.id} className="border-l-2 border-hearth-700 pl-4">
              <span className="text-sm font-medium text-hearth-300">
                {entry.actorName ?? "Someone"}
                {entry.spoken ? <span className="text-hearth-500"> says</span> : null}
              </span>
              <p className="text-hearth-200/80 italic">
                {entry.spoken ? `\u201c${entry.content}\u201d` : entry.content}
              </p>
            </div>
          );
        }

        if (entry.type === "DICE_ROLL" && entry.dice) {
          return <DiceCard key={entry.id} dice={entry.dice} />;
        }

        // A stopping point is a divider, not an announcement — it marks where
        // one evening ended rather than celebrating anything.
        if (entry.bookmark) {
          return (
            <div key={entry.id} className="flex items-center gap-3 py-2">
              <span className="h-px flex-1 bg-hearth-800" />
              <span className="text-xs tracking-wide text-hearth-500 uppercase">
                {entry.content}
              </span>
              <span className="h-px flex-1 bg-hearth-800" />
            </div>
          );
        }

        // SYSTEM events are growth: levels, skill ranks, unlocked Family
        // Moves, things picked up. They get to look like an occasion, because
        // for a ten-year-old that is exactly what they are.
        return (
          <p
            key={entry.id}
            className="rounded-lg border border-moss-600/40 bg-moss-800/20 px-4 py-2 text-sm text-moss-400"
          >
            {entry.content}
          </p>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
