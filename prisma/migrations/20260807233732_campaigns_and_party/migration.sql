-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('SETUP', 'ACTIVE', 'PAUSED', 'COMPLETE');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storylineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tone" "Tone" NOT NULL,
    "readingLevel" "ReadingLevel" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SETUP',
    "currentActIndex" INTEGER NOT NULL DEFAULT 1,
    "worldState" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastPlayedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyMember" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_ownerId_idx" ON "Campaign"("ownerId");

-- CreateIndex
CREATE INDEX "Campaign_storylineId_idx" ON "Campaign"("storylineId");

-- CreateIndex
CREATE INDEX "PartyMember_characterId_idx" ON "PartyMember"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMember_campaignId_characterId_key" ON "PartyMember"("campaignId", "characterId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_storylineId_fkey" FOREIGN KEY ("storylineId") REFERENCES "Storyline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
