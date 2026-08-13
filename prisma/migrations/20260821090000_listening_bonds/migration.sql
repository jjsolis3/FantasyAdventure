-- Talking it over now deepens a bond, and this is the ceiling on it: one pair,
-- one scene, once. Without it the fastest route up the bond ladder would be to
-- open the conversation box and type "hi" at each other repeatedly, which is
-- the exact opposite of what the feature is for.
CREATE TABLE "ListeningBond" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeningBond_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListeningBond_sceneId_relationshipId_key"
    ON "ListeningBond"("sceneId", "relationshipId");

CREATE INDEX "ListeningBond_campaignId_idx" ON "ListeningBond"("campaignId");

ALTER TABLE "ListeningBond" ADD CONSTRAINT "ListeningBond_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
