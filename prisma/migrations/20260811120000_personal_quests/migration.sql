-- A thread of her own.
--
-- Four players following one quest is one player with four mouths. A personal
-- quest is a chapter-sized aim grounded in a girl's own calling rather than the
-- plot, which is what makes the same evening different for each of them.

ALTER TYPE "QuestKind" ADD VALUE 'PERSONAL';

ALTER TABLE "Quest" ADD COLUMN "secretForCharacterId" TEXT;

-- "One main quest per chapter" lived here as a unique index. Personal quests
-- carry a chapter of their own, so the index would now reject the second quest
-- opened for a chapter. It was never enforcing much in any case: Postgres
-- treats NULLs as distinct, so any row with a null actIndex slipped past it.
-- The rule is guarded where it can actually be checked — every opener looks
-- before it creates, inside the turn's own transaction.
DROP INDEX IF EXISTS "Quest_campaignId_actIndex_key";

CREATE INDEX "Quest_secretForCharacterId_idx" ON "Quest"("secretForCharacterId");

-- Losing the character loses her private aims with her; there is nobody left
-- for them to belong to.
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_secretForCharacterId_fkey"
    FOREIGN KEY ("secretForCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
