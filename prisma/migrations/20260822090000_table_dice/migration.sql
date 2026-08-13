-- Real dice, on a real table.
--
-- SERVER is the default, so every adventure already in progress carries on
-- rolling for itself and nothing about tonight changes unless somebody asks.
CREATE TYPE "DiceMode" AS ENUM ('SERVER', 'TABLE');

ALTER TABLE "Campaign" ADD COLUMN "diceMode" "DiceMode" NOT NULL DEFAULT 'SERVER';

-- A turn stopped halfway, waiting for somebody to pick a die off the floor.
-- One per adventure: a table cannot be halfway through two turns at once.
CREATE TABLE "PendingRoll" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "awaited" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRoll_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingRoll_campaignId_key" ON "PendingRoll"("campaignId");

ALTER TABLE "PendingRoll" ADD CONSTRAINT "PendingRoll_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
