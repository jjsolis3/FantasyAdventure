-- Quests, the things they ask for, and what is left when one is spent.
--
-- Chapters have always named things the party should come away holding, and a
-- page could compare that list against everybody's pockets on every load. What
-- was missing was any record that finding one had happened: no completion, no
-- moment, nothing announced, and nothing ever spent. This makes the list
-- durable so it can have an ending.

CREATE TYPE "QuestKind" AS ENUM ('MAIN', 'SIDE');
CREATE TYPE "QuestStatus" AS ENUM ('ACTIVE', 'COMPLETE', 'ABANDONED');
CREATE TYPE "ObjectiveKind" AS ENUM ('FIND', 'DEED');

CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "QuestKind" NOT NULL DEFAULT 'MAIN',
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actIndex" INTEGER,
    "openedAtTurn" INTEGER NOT NULL DEFAULT 0,
    "completedAtTurn" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- One main quest per chapter. Postgres treats NULLs as distinct in a unique
-- index, so side quests (actIndex IS NULL) are not constrained by this.
CREATE UNIQUE INDEX "Quest_campaignId_actIndex_key" ON "Quest"("campaignId", "actIndex");
CREATE INDEX "Quest_campaignId_idx" ON "Quest"("campaignId");

CREATE TABLE "QuestObjective" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "kind" "ObjectiveKind" NOT NULL DEFAULT 'FIND',
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "doneAtTurn" INTEGER,
    "itemName" TEXT,
    "foundByCharacterId" TEXT,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "QuestObjective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestObjective_questId_idx" ON "QuestObjective"("questId");
CREATE INDEX "QuestObjective_foundByCharacterId_idx" ON "QuestObjective"("foundByCharacterId");

-- What a character gave up, and what it bought. An item spent on a quest leaves
-- the pack; without this it would simply be gone from the sheet, which reads as
-- a punishment for having found it.
CREATE TABLE "Keepsake" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Keepsake_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Keepsake_characterId_idx" ON "Keepsake"("characterId");

ALTER TABLE "Quest" ADD CONSTRAINT "Quest_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestObjective" ADD CONSTRAINT "QuestObjective_questId_fkey"
    FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The finder is remembered by name in the announcement either way, so losing
-- the character need not lose the objective.
ALTER TABLE "QuestObjective" ADD CONSTRAINT "QuestObjective_foundByCharacterId_fkey"
    FOREIGN KEY ("foundByCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Keepsake" ADD CONSTRAINT "Keepsake_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
