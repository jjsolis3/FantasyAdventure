-- Inviting somebody else's adventurer along.
--
-- Until now a party could only be assembled from characters one account owned,
-- or by reading a join code out to somebody sitting next to you. That made the
-- two-adventurer minimum unreachable for a household where each player has
-- their own sign-in and their own single character. An invitation crosses that
-- gap: it is addressed to the adventurer, answered by whoever holds them, and
-- until it is answered the adventure does not begin.

CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "PartyInvite" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartyInvite_pkey" PRIMARY KEY ("id")
);

-- One invitation per adventurer per adventure; asking again re-uses the row.
CREATE UNIQUE INDEX "PartyInvite_campaignId_characterId_key" ON "PartyInvite"("campaignId", "characterId");
CREATE INDEX "PartyInvite_characterId_idx" ON "PartyInvite"("characterId");
CREATE INDEX "PartyInvite_invitedById_idx" ON "PartyInvite"("invitedById");

ALTER TABLE "PartyInvite" ADD CONSTRAINT "PartyInvite_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartyInvite" ADD CONSTRAINT "PartyInvite_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartyInvite" ADD CONSTRAINT "PartyInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
