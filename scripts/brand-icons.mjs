/**
 * Rasterises the mark in `app/icon.svg` into every file a browser, a phone or
 * a desktop actually asks for.
 *
 * Run it after editing the mark:
 *
 *     npm run brand:icons
 *
 * The outputs are committed rather than generated at build time, deliberately.
 * They change roughly never, they have to exist before the first request, and
 * `favicon.ico` in particular is fetched by Chrome at moments that have nothing
 * to do with a page load — making a shortcut, for one. A build step is a
 * dependency on the build having run; a committed file is not.
 *
 * ## Why each file exists
 *
 * | File | Who reads it |
 * |---|---|
 * | `app/icon.svg` | Modern browsers, in the tab. The master; not written here. |
 * | `app/favicon.ico` | Windows. **This is the desktop-shortcut fix** — Chrome builds a `.lnk` from the site's `.ico` and shows the generic page glyph without one. |
 * | `app/apple-icon.png` | iOS and iPadOS, when a page is added to the home screen. |
 * | `public/icon-192.png`, `public/icon-512.png` | Android, via the web manifest. **This is the home-screen fix** — with no manifest icon Chrome draws a letter tile from the domain, which is why hearthlight.774entfx.com showed a grey "7". |
 *
 * ## The .ico is written by hand
 *
 * Nothing in the dependency tree encodes ICO, and adding a package to write
 * 200 bytes of header would be the larger cost. The format is a six-byte
 * directory, a sixteen-byte entry per size, and then the images — and since
 * Windows Vista an entry's payload may be a whole PNG rather than a bitmap, so
 * sharp does all the actual encoding.
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const master = await readFile(join(root, "app", "icon.svg"));

/** Renders the mark at one edge length. */
const render = (size) =>
  sharp(master, { density: 384 }).resize(size, size, { fit: "contain" }).png({ compressionLevel: 9 }).toBuffer();

/**
 * A .ico holding one PNG per size.
 *
 * Sizes matter more than they look: 16 is the tab, 32 the taskbar, 48 the
 * desktop shortcut at default scaling, and 64 the same shortcut on a display
 * running at 125% or 150%, where a 48 would be resampled and go soft.
 */
async function ico(sizes) {
  const images = await Promise.all(sizes.map(render));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon, 2 would be a cursor
  header.writeUInt16LE(sizes.length, 4);

  // Every entry has to know where its image starts, so the directory is sized
  // before any offset can be worked out.
  let offset = header.length + sizes.length * 16;
  const entries = sizes.map((size, index) => {
    const entry = Buffer.alloc(16);
    // 256 is stored as 0. Nothing here is that big, but the rule is the format's.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size, 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[index].length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images]);
}

const written = [];
async function write(path, data) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
  written.push(`${path} — ${(data.length / 1024).toFixed(1)} kB`);
}

await write("app/favicon.ico", await ico([16, 32, 48, 64]));
// 180 is what iOS asks for; it downsamples cleanly to every smaller tile it uses.
await write("app/apple-icon.png", await render(180));
await write("public/icon-192.png", await render(192));
await write("public/icon-512.png", await render(512));

console.log(written.map((line) => `  ${line}`).join("\n"));
