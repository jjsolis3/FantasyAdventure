"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkToShape } from "@/lib/images/shrink";

/**
 * Chapter art for one adventure, uploaded rather than generated.
 *
 * The picture every family who plays this adventure will see for this chapter —
 * which is why it lives in settings rather than in a campaign's own gallery,
 * and why it is administrator-only. A drawing in the gallery belongs to one
 * table; this belongs to the library.
 *
 * Uploading is offered even for chapters that already have a file shipped in
 * the repository, because an upload beats a file and that is the point: whoever
 * runs this copy can replace what the game came with, tonight, without a
 * redeploy.
 */

export type ChapterSlot = {
  actIndex: number;
  title: string;
  /** Set when somebody has uploaded one. */
  version: number | null;
  /** Set when a file ships at public/adventures/<slug>/act-N.<ext>. */
  shippedUrl: string | null;
};

export function ChapterArt({ slug, chapters }: { slug: string; chapters: ChapterSlot[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {chapters.map((chapter) => (
        <ChapterFrame key={chapter.actIndex} slug={slug} chapter={chapter} />
      ))}
    </div>
  );
}

function ChapterFrame({ slug, chapter }: { slug: string; chapter: ChapterSlot }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const uploaded = chapter.version !== null;
  const src = uploaded
    ? `/api/chapters/${slug}/${chapter.actIndex}?v=${chapter.version}`
    : chapter.shippedUrl;

  async function choose(file: File) {
    setBusy(true);
    setError("");

    try {
      const shrunk = await shrinkToShape(file, "wide");
      const body = new FormData();
      body.set("picture", shrunk, "chapter.jpg");

      const response = await fetch(`/api/chapters/${slug}/${chapter.actIndex}`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That did not go through. Try again?");
        return;
      }

      router.refresh();
    } catch {
      setError("That picture could not be read. Try a PNG or a JPEG.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/chapters/${slug}/${chapter.actIndex}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-hearth-800/60 p-3">
      <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg border border-hearth-800/60 bg-hearth-900/40">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own bytes,
          // sized by CSS; the loader would add nothing.
          <img src={src} alt={chapter.title} className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full items-center justify-center text-sm text-hearth-600 hover:text-hearth-400 disabled:opacity-50"
          >
            {busy ? "Working…" : "+ add a picture"}
          </button>
        )}
      </div>

      <p className="text-sm text-hearth-400">Chapter {chapter.actIndex}</p>
      <p className="font-display text-hearth-100">{chapter.title}</p>

      <p className="mt-1 text-xs text-hearth-500">
        {uploaded
          ? "Uploaded here"
          : chapter.shippedUrl
            ? "Shipped with the game"
            : "The storyteller will draw one, if pictures are switched on"}
      </p>

      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}

      {src ? (
        <div className="mt-2 flex flex-wrap gap-x-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-xs text-hearth-400 underline underline-offset-4 hover:text-hearth-200 disabled:opacity-50"
          >
            {uploaded ? "replace" : "override"}
          </button>
          {uploaded ? (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="text-xs text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-50"
            >
              remove
            </button>
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
        }}
      />
    </div>
  );
}
