-- Somebody who keeps turning up and is after the same thing they are.
--
-- Nothing is backfilled. A household with no rival is told about nobody, and
-- every adventure already under way plays exactly as it did until one is
-- written down.

CREATE TABLE "Rival" (
  "id"      TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,

  "name"  TEXT NOT NULL,
  "about" TEXT NOT NULL,
  "wants" TEXT NOT NULL,

  "partyAhead" INTEGER NOT NULL DEFAULT 0,
  "rivalAhead" INTEGER NOT NULL DEFAULT 0,

  "lastSeenCampaignId"    TEXT,
  "lastSeenCampaignTitle" TEXT,
  "lastSeenActIndex"      INTEGER,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Rival_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RivalMeeting" (
  "id"      TEXT NOT NULL,
  "rivalId" TEXT NOT NULL,

  "note"    TEXT NOT NULL,
  "outcome" TEXT NOT NULL,

  "campaignId"    TEXT,
  "campaignTitle" TEXT NOT NULL,
  "actIndex"      INTEGER NOT NULL DEFAULT 1,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RivalMeeting_pkey" PRIMARY KEY ("id")
);

-- One per household. A second rival is a cast, and a cast dilutes the one face
-- they are meant to recognise.
CREATE UNIQUE INDEX "Rival_ownerId_key" ON "Rival"("ownerId");
CREATE INDEX "RivalMeeting_rivalId_createdAt_idx" ON "RivalMeeting"("rivalId", "createdAt");

ALTER TABLE "Rival"
  ADD CONSTRAINT "Rival_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RivalMeeting"
  ADD CONSTRAINT "RivalMeeting_rivalId_fkey"
  FOREIGN KEY ("rivalId") REFERENCES "Rival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
