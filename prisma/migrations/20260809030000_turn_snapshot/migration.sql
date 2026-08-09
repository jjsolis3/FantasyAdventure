-- One row per campaign holding the state from just before its most recent
-- turn, so that turn can be taken back.
CREATE TABLE "TurnSnapshot" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "turnCounter" INTEGER NOT NULL,
    "fromOrdinal" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TurnSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurnSnapshot_campaignId_key" ON "TurnSnapshot"("campaignId");

ALTER TABLE "TurnSnapshot" ADD CONSTRAINT "TurnSnapshot_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
