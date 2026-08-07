-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('CHILD', 'TEEN', 'GROWNUP', 'ELDER');

-- CreateEnum
CREATE TYPE "RelationshipKind" AS ENUM ('PARENT', 'CHILD', 'SIBLING', 'GRANDPARENT', 'GRANDCHILD', 'PET', 'FRIEND');

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "gender" TEXT,
    "pronouns" TEXT NOT NULL DEFAULT 'they/them',
    "ageBand" "AgeBand" NOT NULL DEFAULT 'GROWNUP',
    "description" TEXT,
    "might" INTEGER NOT NULL DEFAULT 3,
    "wits" INTEGER NOT NULL DEFAULT 3,
    "heart" INTEGER NOT NULL DEFAULT 3,
    "spark" INTEGER NOT NULL DEFAULT 3,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterSkill" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CharacterSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "characterAId" TEXT NOT NULL,
    "characterBId" TEXT NOT NULL,
    "aToB" "RelationshipKind" NOT NULL,
    "bondLevel" INTEGER NOT NULL DEFAULT 0,
    "bondXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "CharacterSkill_characterId_idx" ON "CharacterSkill"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterSkill_characterId_name_key" ON "CharacterSkill"("characterId", "name");

-- CreateIndex
CREATE INDEX "Relationship_characterBId_idx" ON "Relationship"("characterBId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_characterAId_characterBId_key" ON "Relationship"("characterAId", "characterBId");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSkill" ADD CONSTRAINT "CharacterSkill_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_characterAId_fkey" FOREIGN KEY ("characterAId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_characterBId_fkey" FOREIGN KEY ("characterBId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
