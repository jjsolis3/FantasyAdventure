-- People the family already knows.
--
-- NPC memories have always been recorded and have always died with the campaign
-- that made them. A family could spend four evenings winning over a frightened
-- beekeeper, finish the story, and begin the next one in a world where nobody
-- had ever met him.
--
-- Hung off the character rather than the account, so it survives an adventurer
-- being handed to a child's own sign-in, and so a reunion can be personal: the
-- beekeeper remembers Mira, not "the party".
CREATE TABLE "Acquaintance" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "metInCampaignId" TEXT,
    -- Denormalised on purpose: the id goes when the campaign is deleted, and
    -- "you met her on The Dragon Who Lost Her Name" should outlive the row.
    "metInCampaignTitle" TEXT NOT NULL,
    "timesMet" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Acquaintance_pkey" PRIMARY KEY ("id")
);

-- One row per person per adventurer; meeting them again raises timesMet.
CREATE UNIQUE INDEX "Acquaintance_characterId_key_key" ON "Acquaintance"("characterId", "key");
CREATE INDEX "Acquaintance_characterId_idx" ON "Acquaintance"("characterId");

ALTER TABLE "Acquaintance" ADD CONSTRAINT "Acquaintance_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
