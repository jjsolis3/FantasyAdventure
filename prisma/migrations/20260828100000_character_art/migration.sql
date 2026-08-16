-- A portrait drawn from the wardrobe.
--
-- Its own table rather than another column on CharacterPortrait, because the
-- two must never overwrite each other: a family who generates a portrait and
-- then photographs a felt-tip drawing has to keep the drawing, and one who does
-- it the other way round must not find a machine's guess on top of their art.
--
-- lookKey records what she was wearing when it was drawn, so a changed cloak
-- can be noticed and the screen can offer to draw her again. Without it the
-- picture silently becomes a lie the first time she changes.
CREATE TABLE "CharacterArt" (
  "id"          TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "data"        BYTEA NOT NULL,
  "mimeType"    TEXT NOT NULL DEFAULT 'image/png',
  "lookKey"     TEXT NOT NULL,
  "prompt"      TEXT NOT NULL,
  "model"       TEXT NOT NULL,
  "version"     INTEGER NOT NULL DEFAULT 1,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CharacterArt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CharacterArt_characterId_key" ON "CharacterArt"("characterId");

ALTER TABLE "CharacterArt" ADD CONSTRAINT "CharacterArt_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
