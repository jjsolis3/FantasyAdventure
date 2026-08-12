# Chapter art that ships with the game

Drop a picture here and every family who plays that adventure sees it — and the
storyteller never draws that chapter, so there is no wait, no drawing service
and no cost.

```
public/adventures/<storyline-slug>/act-<n>.webp
```

For example:

```
public/adventures/the-star-thief/act-1.webp
public/adventures/the-star-thief/act-2.webp
public/adventures/the-star-thief/act-3.webp
```

`webp`, `png`, `jpg` and `jpeg` all work; they are looked for in that order.
The slug is the storyline's `slug` in `prisma/storylines.ts` — note that it does
**not** always match the title, because a story can be retitled without breaking
the adventures people are part-way through. `npm run art:prompts` prints the
right filename above every prompt it writes.

## Why files rather than uploads

Both work. Files are version-controlled, ship with the game, and survive the
database being wiped entirely — which makes them the right home for art you are
happy with. Uploading the same picture through **Settings → Adventures →
Chapter pictures** takes effect immediately without a redeploy, which makes it
the right way to iterate while you are still drawing.

An upload beats a file for the same chapter, so you can override what shipped
without deleting anything.

## What wins

Most specific first:

1. A drawing this family made, from the adventure's own picture page
2. Chapter art uploaded in Settings
3. A file here
4. A picture the storyteller generated
5. Nothing — which is the only case where a drawing service is asked at all

## Sizes

Anything reasonable. These are shown across the top of a television, so wide
suits them: 1024×576 or larger, 16:9. Nothing resizes files placed here — unlike
uploads, which are cropped and shrunk in the browser — so keep them under a
megabyte or two for the sake of the page.
