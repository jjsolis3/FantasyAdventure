"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Where the three things at the table live.
 *
 * The play screen used to be one column in a fixed order: quests, then stats,
 * then the picture, then everybody's sheet, then the story, then the controls.
 * Every part of that was worth having and the order was defensible, but on a
 * phone it added up to a page several screens tall whose *longest* element sat
 * in the middle. The narration pushed the only thing you could act on below the
 * fold, and the quest board — which is above the story — was gone the moment
 * the first passage rendered. People were scrolling back up to find out what
 * they were supposed to be doing, or going back a page entirely.
 *
 * The fix is not less content. It is that a phone should show one of these at a
 * time and a laptop should show all of them at once:
 *
 * - **narrow** — three tabs, one panel visible, the others one tap away
 * - **wide**   — the story in a column with the party and the board beside it,
 *                sticky, so nothing is ever more than a glance away
 *
 * Same panels, same components, same server data; only the container changes.
 */
export type PlayTab = "story" | "party" | "quests";

type TabState = { tab: PlayTab; setTab: (tab: PlayTab) => void };

/**
 * So the pinned bar can bring somebody back to the story.
 *
 * The bar lives inside the story panel's own component — it is the only thing
 * that knows whose answer is missing — but it is on screen whichever tab is
 * showing, and "answer" has to mean "go to where the answering happens".
 *
 * Defaults to a no-op rather than throwing: the play client is rendered in
 * tests and on the shared-screen path without a layout around it, and a missing
 * provider should cost a tab switch, not the page.
 */
const TabContext = createContext<TabState>({ tab: "story", setTab: () => {} });

export function usePlayTab(): TabState {
  return useContext(TabContext);
}

const TABS: { id: PlayTab; label: string }[] = [
  { id: "story", label: "Story" },
  { id: "party", label: "Party" },
  { id: "quests", label: "Quests" },
];

export function PlayLayout({
  stats,
  story,
  party,
  quests,
  /**
   * How many things are still open on the board.
   *
   * Shown as a count on the tab, because the whole reason the board got missed
   * is that a folded panel with a neutral label gives no reason to open it.
   */
  openQuests,
}: {
  stats: ReactNode;
  story: ReactNode;
  party: ReactNode;
  quests: ReactNode;
  openQuests: number;
}) {
  const [tab, setTab] = useState<PlayTab>("story");

  return (
    <TabContext.Provider value={{ tab, setTab }}>
      {/* One sticky block, not two. The stat strip and the tabs both want to sit
          directly under the site header, and two elements each claiming that
          same offset land on top of each other. */}
      <div className="sticky top-16 z-30 -mx-6 mb-6 border-b border-hearth-800/60 bg-hearth-950/90 px-6 py-2 backdrop-blur">
        {stats}

        <div
          role="tablist"
          aria-label="What to look at"
          className="print-hide mt-2 flex gap-1 rounded-xl bg-hearth-900/50 p-1 lg:hidden"
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === entry.id
                  ? "bg-hearth-700/70 text-hearth-50"
                  : "text-hearth-300 hover:text-hearth-100"
              }`}
            >
              {entry.label}
              {entry.id === "quests" && openQuests > 0 ? (
                <span className="ml-1.5 text-xs text-hearth-400">{openQuests}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className={tab === "story" ? "" : "hidden lg:block"}>{story}</div>

        {/* Wide only: a rail that scrolls with the page until it reaches the top
            and then stays. Offset by the site header, which is sticky too. */}
        <aside className="mt-8 space-y-6 lg:sticky lg:top-20 lg:mt-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className={tab === "party" ? "" : "hidden lg:block"}>{party}</div>
          <div className={tab === "quests" ? "" : "hidden lg:block"}>{quests}</div>
        </aside>
      </div>
    </TabContext.Provider>
  );
}
