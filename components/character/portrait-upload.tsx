"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";

/** What the stored picture is squared off to. Plenty for a sheet on a phone. */
const SIDE = 512;

/**
 * A picture of an adventurer, chosen rather than generated.
 *
 * The obvious way to put a face on a character sheet would have been to ask the
 * drawing service for one. This is better for the case that actually comes up:
 * a child has drawn their character in felt-tip and wants *that* on the sheet.
 * It also costs nothing, needs no provider configured, works when the internet
 * does not, and never sends a likeness of a real family through an API.
 *
 * The shrinking happens here rather than on the server. A phone photograph is
 * four megabytes of kitchen, and putting that in the database — and then down
 * the wire to every other player, on every page — to show a picture two
 * centimetres across would be absurd. The browser already has the decoder and
 * the canvas, and doing it here means the four megabytes never leave the phone.
 */
export function PortraitUpload({
  characterId,
  characterName,
  version,
}: {
  characterId: string;
  characterName: string;
  /** Present when a portrait exists; changes when it is replaced. */
  version: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(file: File) {
    setBusy(true);
    setError("");

    try {
      const shrunk = await squareAndShrink(file);
      const body = new FormData();
      body.set("portrait", shrunk, "portrait.jpg");

      const response = await fetch(`/api/characters/${characterId}/portrait`, {
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
    setError("");
    try {
      await fetch(`/api/characters/${characterId}/portrait`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-5">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-hearth-800/60 bg-hearth-900/40">
          {version === null ? (
            <div className="flex h-full items-center justify-center text-sm text-hearth-600">
              no picture
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/characters/${characterId}/portrait?v=${version}`}
              alt={characterName}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm text-hearth-400">
            A drawing, a photograph of a drawing, anything at all. It is squared off and shrunk on
            this device before it is sent, so a phone photograph is fine.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-hearth-700 px-4 py-2 text-sm text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-50"
            >
              {busy ? "Working…" : version === null ? "Choose a picture" : "Choose a different one"}
            </button>

            {version === null ? null : (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="rounded-lg px-4 py-2 text-sm text-hearth-400 hover:text-hearth-200 disabled:opacity-50"
              >
                Remove it
              </button>
            )}
          </div>
        </div>
      </div>

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

/**
 * Centre-crops to a square and scales to SIDE, as a JPEG.
 *
 * Cropping rather than letterboxing because every place this appears is a
 * circle or a square, and a portrait with grey bars down the sides looks like a
 * mistake. Centre because the subject of a picture somebody chose as a portrait
 * is, essentially always, in the middle of it.
 */
async function squareAndShrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const side = Math.min(bitmap.width, bitmap.height);
  const left = (bitmap.width - side) / 2;
  const top = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, left, top, side, side, 0, 0, SIDE, SIDE);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("could not encode"))),
      "image/jpeg",
      0.85,
    );
  });
}
