-- One finished adventure, kept where deleting the adventure cannot reach it.
--
-- The long road is otherwise entirely derived, which is the right default: it
-- cannot drift, and it stays true if a turn is taken back. But deleting an
-- adventure cascades, and a trophy room that forgets five evenings because
-- somebody tidied up is worse than none. Acquaintance solved the same problem
-- the same way — keep the title beside the id, because the id goes when the
-- campaign does and the memory should not.
CREATE TABLE "RoadEntry" (
  "id"             TEXT NOT NULL,
  "characterId"    TEXT NOT NULL,
  "campaignId"     TEXT,
  "campaignTitle"  TEXT NOT NULL,
  "storylineTitle" TEXT NOT NULL,
  "finishedAt"     TIMESTAMP(3) NOT NULL,
  "chapters"       INTEGER NOT NULL DEFAULT 0,
  "errands"        INTEGER NOT NULL DEFAULT 0,
  "ownAims"        INTEGER NOT NULL DEFAULT 0,
  "xpEarned"       INTEGER NOT NULL DEFAULT 0,
  "rollsThrown"    INTEGER NOT NULL DEFAULT 0,
  "rollsLanded"    INTEGER NOT NULL DEFAULT 0,
  "bestRoll"       INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoadEntry_pkey" PRIMARY KEY ("id")
);

-- One per adventurer per adventure. Finishing twice — undo, then finish again —
-- updates the row rather than writing a second.
CREATE UNIQUE INDEX "RoadEntry_characterId_campaignId_key"
  ON "RoadEntry"("characterId", "campaignId");
CREATE INDEX "RoadEntry_characterId_idx" ON "RoadEntry"("characterId");
CREATE INDEX "RoadEntry_campaignId_idx" ON "RoadEntry"("campaignId");

ALTER TABLE "RoadEntry" ADD CONSTRAINT "RoadEntry_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE, and that is the entire point of the table: the
-- adventure can go, and the fact that she finished it stays.
ALTER TABLE "RoadEntry" ADD CONSTRAINT "RoadEntry_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
