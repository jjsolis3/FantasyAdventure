-- Something small that comes along.
--
-- Nothing is backfilled. An adventurer with no companion has none, and the
-- storyteller is told about nobody.

CREATE TABLE "Companion" (
  "id"          TEXT NOT NULL,
  "characterId" TEXT NOT NULL,

  "name"  TEXT NOT NULL,
  "kind"  TEXT NOT NULL,
  "knack" TEXT NOT NULL,

  "closeness" INTEGER NOT NULL DEFAULT 0,

  "foundInCampaignId"    TEXT,
  "foundInCampaignTitle" TEXT NOT NULL,
  "countedActIndex"      INTEGER,
  "countedCampaignId"    TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Companion_pkey" PRIMARY KEY ("id")
);

-- One at a time. A menagerie is a list; one companion is a friend.
CREATE UNIQUE INDEX "Companion_characterId_key" ON "Companion"("characterId");

ALTER TABLE "Companion"
  ADD CONSTRAINT "Companion_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
