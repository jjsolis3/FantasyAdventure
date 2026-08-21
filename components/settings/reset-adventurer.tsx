"use client";

import { useActionState, useState } from "react";
import { resetCharacterAction, type ResetFormState } from "@/lib/game/reset-actions";
import { StatAllocator } from "@/components/character/stat-allocator";
import { SkillPicker } from "@/components/character/skill-picker";
import { findArchetype } from "@/lib/game/character-options";
import { capitalise, pronounsOf, toBe, toBePast, toHave } from "@/lib/game/pronouns";
import {
  MAX_LEVEL,
  POINTS_TO_SPEND,
  STATS,
  STAT_BUDGET,
  STAT_MIN,
  levelFor,
  statPointsEarned,
  xpForLevel,
  type StatBlock,
  type StatKey,
} from "@/lib/game/rules";

/**
 * The form that puts an adventurer right.
 *
 * Written to be read before it is used, which is unusual for a form and right
 * for this one. What the destructive half undoes took evenings to earn.
 *
 * ## Two modes, because people mean two things
 *
 * A household asked, reasonably: *"should I reset their stats, and remove the
 * newly received skills, so it can be applied with the new growth rules — I
 * just don't want the current characters to be penalised for no reason."* There
 * was no answer to that. The only button here threw away four evenings to fix a
 * spread of numbers.
 *
 * So the safe one is the default and comes first, and the destructive one has
 * to be chosen. Both share the builder's own controls rather than reimplementing
 * them — which is not only tidiness. The stat grid here used to be seven bare
 * number inputs showing absolute values, under a sentence about the twelve
 * points spent *above the floor*; count the boxes and you get nineteen, and the
 * screen congratulates you on twelve. `StatAllocator` starts at the floor and
 * counts up, so the number you are told is the number you are spending.
 */
export function ResetAdventurer({
  characterId,
  name,
  pronouns,
  archetype,
  suggested,
  current,
  level,
  xp,
}: {
  characterId: string;
  name: string;
  /** Written on her sheet. Every sentence below is built from it. */
  pronouns: string | null;
  archetype: string;
  suggested: StatBlock;
  current: StatBlock;
  level: number;
  xp: number;
}) {
  const [state, action, pending] = useActionState<ResetFormState, FormData>(
    resetCharacterAction,
    {},
  );

  // The safe one first, and chosen rather than assumed. A screen that opens on
  // the destructive option is one mis-click from an evening lost.
  const [mode, setMode] = useState<"RELAY_NUMBERS" | "START_AGAIN">("RELAY_NUMBERS");
  const [build, setBuild] = useState<StatBlock>(suggested);
  const [skills, setSkills] = useState<string[]>([]);
  const [levelField, setLevelField] = useState(String(level));
  const [xpField, setXpField] = useState(String(xp));

  const they = pronounsOf(pronouns);
  const affinity: StatKey | null = findArchetype(archetype)?.affinity ?? null;

  const spent = STATS.reduce((sum, stat) => sum + build[stat], 0);
  const left = STAT_BUDGET - spent;

  const starting = mode === "START_AGAIN";

  // What the numbers in the boxes would actually become. Worked out here so the
  // screen can promise it before anybody agrees, rather than leaving somebody to
  // discover that their level went up on its own.
  const askedLevel = Number(levelField);
  const askedXp = Number(xpField);
  const legalNumbers =
    Number.isInteger(askedLevel) &&
    askedLevel >= 1 &&
    askedLevel <= MAX_LEVEL &&
    Number.isInteger(askedXp) &&
    askedXp >= 0;
  const floorLevel = legalNumbers ? levelFor(askedXp) : level;
  const willBeLevel = legalNumbers ? Math.max(floorLevel, askedLevel) : level;
  const handedBack = legalNumbers ? statPointsEarned(askedXp) : statPointsEarned(xp);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="characterId" value={characterId} />
      <input type="hidden" name="mode" value={mode} />

      {/* ---- Which of the two ------------------------------------------- */}
      <fieldset className="rounded-xl border border-hearth-800/60 bg-hearth-900/20 p-4">
        <legend className="px-2 text-sm font-medium text-hearth-200">What do you want to do?</legend>

        <div className="mt-2 space-y-3">
          <Choice
            checked={!starting}
            onChoose={() => setMode("RELAY_NUMBERS")}
            title={`Re-lay ${they.possessive} numbers`}
            blurb={`${capitalise(they.subject)} ${toHave(they.subject)} everything ${they.subject} ${toHave(they.subject)} earned — the level, the experience, the skills, the knacks, the pockets, the people ${they.subject} ${toHave(they.subject)} met. Only the seven numbers change, and every point ${they.possessive} experience has earned comes back to spend again.`}
            tone="safe"
          />
          <Choice
            checked={starting}
            onChoose={() => setMode("START_AGAIN")}
            title={`Start ${name} again`}
            blurb={`Back to the day ${they.subject} ${toBePast(they.subject)} built. Level 1, no experience, and nothing ${they.subject} ${toHave(they.subject)} earned since.`}
            tone="grave"
          />
        </div>
      </fieldset>

      {/* ---- Where the numbers land ------------------------------------- */}
      {starting ? null : (
        <div className="rounded-xl border border-hearth-800/60 bg-hearth-900/20 p-4">
          <h3 className="font-display mb-1 text-lg text-hearth-100">
            Level and experience
          </h3>
          <p className="mb-4 text-sm text-hearth-300/80">
            Leave them alone unless one of them is wrong — this is usually the reason to be here at
            all. A level can go above what the experience has paid for; it cannot go below, because
            the game raises it back on the next turn anybody plays.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <label className="block">
              <span className="block text-sm text-hearth-300">Level</span>
              <input
                type="number"
                name="level"
                value={levelField}
                min={1}
                max={MAX_LEVEL}
                onChange={(event) => setLevelField(event.target.value)}
                className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100"
              />
              <span className="mt-1 block text-xs text-hearth-500">now {level}</span>
            </label>

            <label className="block">
              <span className="block text-sm text-hearth-300">Experience</span>
              <input
                type="number"
                name="xp"
                value={xpField}
                min={0}
                onChange={(event) => setXpField(event.target.value)}
                className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-3 py-2 text-hearth-100"
              />
              <span className="mt-1 block text-xs text-hearth-500">now {xp}</span>
            </label>
          </div>

          {legalNumbers ? (
            <p className="mt-3 text-sm text-hearth-300">
              {capitalise(they.subject)} would end up at{" "}
              <span className="text-hearth-100">level {willBeLevel}</span> on {askedXp} experience
              {willBeLevel > askedLevel ? (
                <span className="text-amber-300">
                  {" "}
                  — raised from {askedLevel}, because {askedXp} experience already pays for{" "}
                  {floorLevel}
                </span>
              ) : null}
              {/* Counted from where he would actually land, not from what was
                  typed. Asking for 2 with 400 experience lands on 6, and
                  quoting the cost of 3 beside that is a third number nobody
                  asked about. */}
              {willBeLevel < MAX_LEVEL ? (
                <span className="text-hearth-500">
                  {" "}
                  · level {willBeLevel + 1} costs {xpForLevel(willBeLevel + 1)}
                </span>
              ) : null}
              .
            </p>
          ) : (
            <p className="mt-3 text-sm text-amber-300">
              A level between 1 and {MAX_LEVEL}, and experience of nought or more.
            </p>
          )}

          {handedBack > 0 ? (
            <p className="mt-1.5 text-sm text-moss-400">
              {handedBack} earned {handedBack === 1 ? "point" : "points"} come back for{" "}
              {they.object} to spend again, on top of the {POINTS_TO_SPEND} below.
            </p>
          ) : null}
        </div>
      )}

      {/* ---- The seven numbers ------------------------------------------- */}
      <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-4">
        <h3 className="font-display mb-1 text-lg text-hearth-100">
          {capitalise(they.possessive)} numbers
        </h3>
        <p className="mb-4 text-sm text-hearth-300/80">
          These are set when an adventurer is built and only ever go up afterwards, so the game
          knows how many points {name} earned but not which numbers they went into. Below is a best
          guess — if you remember how {they.subject} {toBePast(they.subject)} built, put it right.
        </p>

        <StatAllocator stats={build} onChange={setBuild} affinity={affinity} />

        {/* Both totals, out loud. The allocator counts the points being spent
            above a floor of one in everything; the number written on the sheet
            is that plus the floor. Saying only one of them is what made this
            screen look broken — "all 12 spent" over boxes adding up to 19. */}
        <p
          className={`mt-3 text-sm ${left === 0 ? "text-moss-400" : "text-amber-300"}`}
          aria-live="polite"
        >
          {left === 0
            ? `All ${POINTS_TO_SPEND} spent — ${STAT_BUDGET} in total, counting the ${STAT_MIN} every stat starts at.`
            : left > 0
              ? `${left} point${left === 1 ? "" : "s"} still to spend.`
              : `${-left} point${left === -1 ? "" : "s"} too many.`}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-hearth-500">
          {STATS.map((stat) => (
            <span key={stat}>
              {stat} {current[stat]} → {build[stat]}
            </span>
          ))}
        </div>
      </div>

      {/* ---- The two she begins with ------------------------------------- */}
      {starting ? (
        <div className="rounded-xl border border-hearth-700/60 bg-hearth-900/40 p-4">
          <h3 className="font-display mb-1 text-lg text-hearth-100">
            What {they.subject} {toBe(they.subject)} good at
          </h3>
          <p className="mb-4 text-sm text-hearth-300/80">
            Starting again clears every skill, so {they.subject} {toHave(they.subject)} the same two
            a newly built adventurer does. Leave them blank and {they.subject} will simply be
            offered two on {they.possessive} own sheet instead.
          </p>
          <SkillPicker archetype={archetype} skills={skills} onChange={setSkills} />
        </div>
      ) : null}

      {/* ---- Saying yes on purpose --------------------------------------- */}
      <div>
        <label htmlFor="confirmName" className="block text-sm text-hearth-300">
          Type <span className="text-hearth-100">{name}</span> to confirm
        </label>
        <input
          id="confirmName"
          name="confirmName"
          autoComplete="off"
          placeholder={name}
          className="mt-1 w-full rounded-lg border border-hearth-700 bg-hearth-950/60 px-4 py-2.5 text-hearth-100 placeholder:text-hearth-700"
        />
        <p className="mt-1.5 text-sm text-hearth-500">
          Typing the name is the one confirmation that cannot be clicked through by mistake — and
          it makes resetting the wrong adventurer of two very hard to do.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-lg border border-rose-800/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || left !== 0 || (!starting && !legalNumbers)}
        className={`rounded-lg border px-5 py-2.5 font-medium disabled:opacity-40 ${
          starting
            ? "border-rose-700/60 bg-rose-900/30 text-rose-100 hover:bg-rose-900/50"
            : "border-hearth-600 bg-hearth-700/40 text-hearth-100 hover:bg-hearth-700/60"
        }`}
      >
        {pending
          ? "Saving…"
          : starting
            ? `Start ${name} again`
            : `Re-lay ${they.possessive} numbers`}
      </button>
    </form>
  );
}

/**
 * One of the two, as a whole clickable card rather than a radio and a label.
 *
 * The difference between them is a paragraph, not a word, and a paragraph
 * beside a twelve-pixel circle gets skimmed. This is the one choice on the page
 * that has to be read.
 */
function Choice({
  checked,
  onChoose,
  title,
  blurb,
  tone,
}: {
  checked: boolean;
  onChoose: () => void;
  title: string;
  blurb: string;
  tone: "safe" | "grave";
}) {
  return (
    <label
      className={`block cursor-pointer rounded-lg border p-3 transition-colors ${
        checked
          ? tone === "grave"
            ? "border-rose-700/60 bg-rose-950/20"
            : "border-moss-700/50 bg-moss-900/15"
          : "border-hearth-800/60 hover:border-hearth-700"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <input
          type="radio"
          name="modeChoice"
          checked={checked}
          onChange={onChoose}
          className="accent-hearth-400"
        />
        <span
          className={`font-medium ${
            checked && tone === "grave" ? "text-rose-200" : "text-hearth-100"
          }`}
        >
          {title}
        </span>
      </div>
      <p className="mt-1 pl-6 text-sm text-hearth-300/80">{blurb}</p>
    </label>
  );
}
