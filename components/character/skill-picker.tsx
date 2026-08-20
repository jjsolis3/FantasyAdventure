"use client";

import { useMemo } from "react";
import { findArchetype, skillGroupsFor } from "@/lib/game/character-options";
import { SKILLS_PER_CHARACTER } from "@/lib/game/rules";

/**
 * Picking the things she is especially good at, to begin with.
 *
 * Lifted out of the builder because there are two places an adventurer gets her
 * starting skills now, and there should not be two pickers. The reset screen
 * used to hand back none at all — every skill row deleted, nothing offered —
 * so an adventurer started again walked away with zero where a brand-new one
 * has two, and the only way to notice was to go and find the offer on her own
 * sheet afterwards.
 *
 * Grouped rather than one long row. This was a flat list of the twenty-four
 * skills the callings suggest, which was already a wall; with fifty-six it
 * would be an unreadable one, and the general pool exists so a girl can be good
 * at swimming or drawing, which is no use if she cannot find them. Her own
 * calling's three come first and stay green.
 *
 * Controlled, and it writes its own hidden inputs — so a parent form only has
 * to hold the array and the server reads `skills` either way.
 */
export function SkillPicker({
  archetype,
  skills,
  onChange,
  limit = SKILLS_PER_CHARACTER,
}: {
  archetype: string;
  skills: string[];
  onChange: (skills: string[]) => void;
  /** How many she may hold. Two, everywhere so far. */
  limit?: number;
}) {
  const suggested = useMemo(() => findArchetype(archetype)?.skills ?? [], [archetype]);
  const groups = useMemo(() => skillGroupsFor(archetype), [archetype]);

  const atLimit = skills.length >= limit;

  function toggle(skill: string) {
    onChange(
      skills.includes(skill)
        ? skills.filter((entry) => entry !== skill)
        : skills.length < limit
          ? [...skills, skill]
          : skills,
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-medium text-hearth-200">
          Pick {limit} things you are especially good at
        </span>
        <span className="text-sm text-hearth-400">
          {skills.length}/{limit}
        </span>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs tracking-wide text-hearth-500 uppercase">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.skills.map((skill) => {
                const chosen = skills.includes(skill);
                const isSuggested = suggested.includes(skill);

                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggle(skill)}
                    disabled={!chosen && atLimit}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-30 ${
                      chosen
                        ? "border-hearth-500 bg-hearth-700/40 text-hearth-100"
                        : isSuggested
                          ? "border-moss-600/50 text-moss-400 hover:border-moss-600"
                          : "border-hearth-800/70 text-hearth-300 hover:border-hearth-700"
                    }`}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {suggested.length > 0 ? (
        <p className="mt-3 text-sm text-hearth-400">
          Green ones suit a {archetype}, but you are free to pick any of them.
        </p>
      ) : null}

      {/* What the server actually reads. The buttons are for people. */}
      {skills.map((skill) => (
        <input key={skill} type="hidden" name="skills" value={skill} />
      ))}
    </div>
  );
}
