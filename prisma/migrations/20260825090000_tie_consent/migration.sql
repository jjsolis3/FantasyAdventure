-- A tie that touches another household now waits for their yes.
--
-- Two nullable columns rather than a status enum, because the two questions
-- being asked are different: *who asked* is a person, and *has it been agreed*
-- is a moment. A status would have to encode both and would still not say when.
ALTER TABLE "Relationship" ADD COLUMN "proposedById" TEXT;
ALTER TABLE "Relationship" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Every tie that already exists is confirmed, without exception.
--
-- This is the whole reason the column is nullable rather than defaulted: a
-- family mid-adventure must not come back after a deploy to find their sisters
-- unrelated, their bonds frozen and their Family Moves gone. The declaration
-- was made under the old rule and the old rule is honoured.
--
-- It also makes NULL mean exactly one thing from here on — "asked, not yet
-- answered" — rather than the two things a backfill-free column would have
-- meant. Every rule in lib/game/ties.ts depends on that.
UPDATE "Relationship" SET "confirmedAt" = CURRENT_TIMESTAMP WHERE "confirmedAt" IS NULL;

CREATE INDEX "Relationship_proposedById_idx" ON "Relationship"("proposedById");

ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_proposedById_fkey"
  FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
