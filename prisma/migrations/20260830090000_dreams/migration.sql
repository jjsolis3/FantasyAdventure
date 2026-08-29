-- The one thing an adventurer wants that no single adventure can give her.
--
-- Nothing is backfilled. A character with no dream simply has none, and the
-- storyteller is told about nobody — so every adventure already under way plays
-- exactly as it did until somebody writes one down.

CREATE TYPE "DreamStatus" AS ENUM ('ACTIVE', 'ANSWERED', 'SET_ASIDE');

CREATE TABLE "Dream" (
  "id"          TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "wish"        TEXT NOT NULL,
  "status"      "DreamStatus" NOT NULL DEFAULT 'ACTIVE',

  "answeredAt"              TIMESTAMP(3),
  "answeredInCampaignId"    TEXT,
  "answeredInCampaignTitle" TEXT,
  "answeredNote"            TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Dream_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DreamEcho" (
  "id"            TEXT NOT NULL,
  "dreamId"       TEXT NOT NULL,
  "note"          TEXT NOT NULL,
  "campaignId"    TEXT,
  "campaignTitle" TEXT NOT NULL,
  "atTurn"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DreamEcho_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Dream_characterId_status_idx" ON "Dream"("characterId", "status");
CREATE INDEX "DreamEcho_dreamId_createdAt_idx" ON "DreamEcho"("dreamId", "createdAt");

ALTER TABLE "Dream"
  ADD CONSTRAINT "Dream_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DreamEcho"
  ADD CONSTRAINT "DreamEcho_dreamId_fkey"
  FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
