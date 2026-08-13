-- Something standing in front of the party until they deal with it.
--
-- The first thing in this game with a life longer than one turn. Nothing has hit
-- points and nothing is fought: `ground` runs from −3 to +3, their successes push
-- it up, the encounter's own roll pushes it down, and both ends are an ending.
CREATE TYPE "EncounterKind" AS ENUM ('PERSON', 'TRAP', 'PUZZLE');
CREATE TYPE "EncounterEnding" AS ENUM ('THROUGH', 'TURNED');

CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "want" TEXT NOT NULL,
    "kind" "EncounterKind" NOT NULL DEFAULT 'PERSON',
    "works" TEXT[],
    "backfires" TEXT[],
    "wayOut" TEXT NOT NULL,
    "ground" INTEGER NOT NULL DEFAULT 0,
    "nerve" INTEGER NOT NULL DEFAULT 11,
    "soloCharacterId" TEXT,
    "helperIds" TEXT[],
    "ending" "EncounterEnding",
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Encounter_campaignId_sceneId_idx" ON "Encounter"("campaignId", "sceneId");

ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
