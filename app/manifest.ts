import type { MetadataRoute } from "next";

/**
 * What a phone reads when somebody adds Hearthlight to their home screen.
 *
 * Without this file Chrome has nothing to draw, so it falls back to a letter
 * tile made from the domain — which is why `hearthlight.774entfx.com` arrived
 * on a home screen as a grey circle with a **7** in it. The icons below are
 * what replaces that.
 *
 * `purpose: "any maskable"` on both sizes is a claim, and one worth being able
 * to defend: Android crops home-screen icons to whatever shape the launcher
 * prefers and guarantees only the middle 80%. The mark is drawn so its
 * furthest corner sits 189 units from the centre of a 512 grid, comfortably
 * inside the 204.8 that circle allows — see the note in `app/icon.svg`. If the
 * mark is ever redrawn wider, this line has to be re-earned or split into a
 * separate padded icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hearthlight",
    // What actually fits under an icon on a home screen. The long name is used
    // in the install prompt and the app switcher, where there is room for it.
    short_name: "Hearthlight",
    description: "A wholesome, AI-guided fantasy adventure for the whole family",
    start_url: "/",
    // Opened from the home screen it should feel like the app rather than a
    // browser tab — no address bar, which also stops a nine-year-old from
    // navigating out of the story by accident.
    display: "standalone",
    orientation: "portrait",
    // The colour behind the app while it starts, and the one the phone tints
    // its own furniture with. Both are the app's real background, so the
    // launch does not flash white before the candlelight arrives.
    background_color: "#241309",
    theme_color: "#241309",
    // The same two files declared under both purposes, rather than the
    // space-separated `"any maskable"` the specification also allows — Next's
    // types take one purpose per entry, and separate entries say exactly the
    // same thing to a phone. `any` is what the install prompt and the app
    // switcher draw; `maskable` is what the home screen crops.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
