"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkToShape } from "@/lib/images/shrink";

/**
 * One frame in the gallery: a thing, and the picture of it if there is one.
 *
 * Written so an empty frame is an invitation rather than a gap. A page that
 * only listed what had already been drawn would be a page nobody ever adds to,
 * so every person the story remembers gets a frame with their name under it
 * from the moment they are met.
 *
 * Faces are squared off and places are cropped wide, which is decided here
 * rather than by the person uploading — a ten-year-old should not have to
 * think about aspect ratios to put her drawing of a troll on the television.
 */

export type SlotPicture = { id: string; version: number; uploadedBy: string | null };

export function PictureSlot({
  campaignId,
  kind,
  subjectKey,
  label,
  about,
  picture,
}: {
  campaignId: string;
  kind: "SCENE" | "PERSON" | "PLACE";
  subjectKey: string;
  label: string;
  about: string | null;
  picture: SlotPicture | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const square = kind === "PERSON";

  async function choose(file: File) {
    setBusy(true);
    setError("");

    try {
      const shrunk = await shrinkToShape(file, square ? "square" : "wide");
      const body = new FormData();
      body.set("picture", shrunk, "picture.jpg");
      body.set("kind", kind);
      body.set("key", subjectKey);
      body.set("label", label);

      const response = await fetch(`/api/campaigns/${campaignId}/pictures`, {
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
    if (!picture) return;
    setBusy(true);
    try {
      await fetch(`/api/campaigns/${campaignId}/pictures/${picture.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-hearth-800/60 p-3">
      <div
        className={`mb-3 overflow-hidden rounded-lg border border-hearth-800/60 bg-hearth-900/40 ${
          square ? "mx-auto aspect-square w-32" : "aspect-video w-full"
        }`}
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- bytes from our
          // own API, sized by CSS; the loader would add nothing.
          <img
            // The version is in the address, so a redrawn picture arrives as a
            // different URL rather than as the same one that quietly changed.
            src={`/api/campaigns/${campaignId}/pictures/${picture.id}?v=${picture.version}`}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full items-center justify-center text-sm text-hearth-600 hover:text-hearth-400 disabled:opacity-50"
          >
            {busy ? "Working…" : "+ add a drawing"}
          </button>
        )}
      </div>

      <p className="font-display text-hearth-100">{label}</p>
      {about ? <p className="mt-0.5 line-clamp-2 text-sm text-hearth-400">{about}</p> : null}

      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}

      {picture ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {picture.uploadedBy ? (
            <span className="text-xs text-hearth-500">by {picture.uploadedBy}</span>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-xs text-hearth-400 underline underline-offset-4 hover:text-hearth-200 disabled:opacity-50"
          >
            replace
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="text-xs text-hearth-500 underline underline-offset-4 hover:text-hearth-300 disabled:opacity-50"
          >
            remove
          </button>
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
