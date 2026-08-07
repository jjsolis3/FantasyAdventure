-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('COZY', 'ADVENTUROUS');

-- CreateEnum
CREATE TYPE "ReadingLevel" AS ENUM ('EARLY_READER', 'MIDDLE_GRADE', 'TEEN', 'FAMILY_MIXED');

-- CreateTable
CREATE TABLE "Storyline" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "premise" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "defaultTone" "Tone" NOT NULL DEFAULT 'COZY',
    "readingLevel" "ReadingLevel" NOT NULL DEFAULT 'FAMILY_MIXED',
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "maxPlayers" INTEGER NOT NULL DEFAULT 5,
    "estimatedScenes" INTEGER NOT NULL DEFAULT 12,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Storyline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorylineAct" (
    "id" TEXT NOT NULL,
    "storylineId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "beats" TEXT[],

    CONSTRAINT "StorylineAct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Storyline_slug_key" ON "Storyline"("slug");

-- CreateIndex
CREATE INDEX "Storyline_isActive_idx" ON "Storyline"("isActive");

-- CreateIndex
CREATE INDEX "StorylineAct_storylineId_idx" ON "StorylineAct"("storylineId");

-- CreateIndex
CREATE UNIQUE INDEX "StorylineAct_storylineId_index_key" ON "StorylineAct"("storylineId", "index");

-- AddForeignKey
ALTER TABLE "StorylineAct" ADD CONSTRAINT "StorylineAct_storylineId_fkey" FOREIGN KEY ("storylineId") REFERENCES "Storyline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
