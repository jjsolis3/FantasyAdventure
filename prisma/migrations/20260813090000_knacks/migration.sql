-- What levelling up finally buys.
--
-- Reaching a level was announced and then read by nothing at all: the number
-- went up, the table was told, and not one thing about the character changed.
-- A knack is one thing she can now do that she could not do before, chosen from
-- three — and the three are drawn from what she has actually been doing rather
-- than from a menu everybody sees, so two girls who levelled on the same
-- evening are offered different things.
CREATE TABLE "CharacterKnack" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "chosenAtLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterKnack_pkey" PRIMARY KEY ("id")
);

-- One of each, ever. A knack taken twice would be a bug wearing a reward's hat.
CREATE UNIQUE INDEX "CharacterKnack_characterId_key_key" ON "CharacterKnack"("characterId", "key");
CREATE INDEX "CharacterKnack_characterId_idx" ON "CharacterKnack"("characterId");

ALTER TABLE "CharacterKnack" ADD CONSTRAINT "CharacterKnack_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
