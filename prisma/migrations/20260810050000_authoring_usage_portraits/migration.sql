-- Three things that turn this from an app a family plays into one they run.

-- Adventures somebody wrote themselves. The seed replaces the acts of every
-- storyline it knows about on every container start, which is right for the ones
-- it ships and would quietly destroy one written on a Sunday evening. From here
-- the seed skips anything flagged custom.
ALTER TABLE "Storyline" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- What the provider charges. Unset by default, because prices change monthly and
-- differ per provider: a number baked into the code would be a confident lie.
ALTER TABLE "AiSetting"
    ADD COLUMN "inputPricePer1M" DOUBLE PRECISION,
    ADD COLUMN "outputPricePer1M" DOUBLE PRECISION,
    ADD COLUMN "imagePrice" DOUBLE PRECISION,
    ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

-- A picture of an adventurer, uploaded rather than generated.
CREATE TABLE "CharacterPortrait" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterPortrait_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CharacterPortrait_characterId_key" ON "CharacterPortrait"("characterId");

ALTER TABLE "CharacterPortrait" ADD CONSTRAINT "CharacterPortrait_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
