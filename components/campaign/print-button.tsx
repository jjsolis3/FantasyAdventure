"use client";

/**
 * Printing needs a click, and a click needs JavaScript — but the page it prints
 * does not, which is why this is the only client component on the journal.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50"
    >
      Print or save as PDF
    </button>
  );
}
