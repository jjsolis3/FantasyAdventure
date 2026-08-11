-- Practice, and things you have not grown into yet.
--
-- Skill experience was only ever awarded when a check happened to name a skill
-- the character already had. A girl who said "I climb the drainpipe", with
-- nothing on her sheet about climbing, rolled, earned experience toward her
-- level, and got nothing at all that would make climbing easier next time. The
-- attempt was forgotten the moment the dice landed.
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "learnedAtTurn" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Practice_characterId_key_key" ON "Practice"("characterId", "key");
CREATE INDEX "Practice_characterId_idx" ON "Practice"("characterId");

ALTER TABLE "Practice" ADD CONSTRAINT "Practice_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Something found that she cannot use yet. The alternative to a gear shop: a
-- silver flute she cannot play is a better reason to want to grow than a price
-- tag, and it costs nothing and belongs to nobody else.
ALTER TABLE "InventoryItem" ADD COLUMN "requiresSkill" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "requiresRank" INTEGER;
ALTER TABLE "InventoryItem" ADD COLUMN "requiresLevel" INTEGER;
