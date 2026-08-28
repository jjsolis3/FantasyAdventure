-- Two ways on, offered when a chapter closes, chosen by the table.
--
-- Nothing is backfilled. An adventure part-way through has no fork behind it
-- and never will; the first one it meets is at the end of its current chapter.

CREATE TABLE "Fork" (
  "id"            TEXT NOT NULL,
  "campaignId"    TEXT NOT NULL,
  "afterActIndex" INTEGER NOT NULL,

  "whereA" TEXT NOT NULL,
  "whyA"   TEXT NOT NULL,
  "whereB" TEXT NOT NULL,
  "whyB"   TEXT NOT NULL,

  "chosen"     TEXT,
  "chosenAt"   TIMESTAMP(3),
  "chosenById" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Fork_pkey" PRIMARY KEY ("id")
);

-- One turning between any two chapters. A second would mean two open questions
-- and no way to tell which the story answered.
CREATE UNIQUE INDEX "Fork_campaignId_afterActIndex_key" ON "Fork"("campaignId", "afterActIndex");

ALTER TABLE "Fork"
  ADD CONSTRAINT "Fork_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Fork"
  ADD CONSTRAINT "Fork_chosenById_fkey"
  FOREIGN KEY ("chosenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
