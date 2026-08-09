-- Playing from more than one device.
--
-- Two things arrive together, because neither is much use alone: a join code,
-- so another household can bring an adventurer into somebody else's adventure,
-- and rounds, so the party can answer at the same time from different rooms and
-- still take one turn together.

CREATE TYPE "InputMode" AS ENUM ('SHARED_SCREEN', 'OWN_DEVICE');
CREATE TYPE "RoundMode" AS ENUM ('ACTION', 'TALK');
CREATE TYPE "RoundStatus" AS ENUM ('COLLECTING', 'RESOLVING', 'RESOLVED', 'CANCELLED');

ALTER TABLE "Campaign"
    ADD COLUMN "inputMode" "InputMode" NOT NULL DEFAULT 'SHARED_SCREEN',
    ADD COLUMN "joinCode" TEXT;

-- Existing adventures need a code before the column can be required. md5 gives
-- hex, whose 0 and 1 are exactly the characters that get misread when a code is
-- read aloud across a kitchen table, so they are translated away — the rest of
-- the hex alphabet is already unambiguous.
UPDATE "Campaign"
SET "joinCode" = 'PARTY-'
    || substr(translate(upper(md5("id" || random()::text)), '01', 'WX'), 1, 4)
    || '-'
    || substr(translate(upper(md5("id" || random()::text)), '01', 'WX'), 5, 4)
WHERE "joinCode" IS NULL;

ALTER TABLE "Campaign" ALTER COLUMN "joinCode" SET NOT NULL;
CREATE UNIQUE INDEX "Campaign_joinCode_key" ON "Campaign"("joinCode");

-- A round is a waiting room in front of an ordinary turn. The unique constraint
-- on (campaignId, number) is what stops two devices opening two rounds at once:
-- both compute the same next number, and the loser is handed the winner's row.
CREATE TABLE "TurnRound" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "mode" "RoundMode" NOT NULL DEFAULT 'ACTION',
    "status" "RoundStatus" NOT NULL DEFAULT 'COLLECTING',
    "stage" TEXT,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "familyMove" JSONB,
    "retelling" BOOLEAN NOT NULL DEFAULT false,
    "correction" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "TurnRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurnRound_campaignId_number_key" ON "TurnRound"("campaignId", "number");
CREATE INDEX "TurnRound_campaignId_status_idx" ON "TurnRound"("campaignId", "status");

ALTER TABLE "TurnRound" ADD CONSTRAINT "TurnRound_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RoundAnswer" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "userId" TEXT,
    "text" TEXT NOT NULL,
    "waiting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoundAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoundAnswer_roundId_characterId_key" ON "RoundAnswer"("roundId", "characterId");
CREATE INDEX "RoundAnswer_characterId_idx" ON "RoundAnswer"("characterId");
CREATE INDEX "RoundAnswer_userId_idx" ON "RoundAnswer"("userId");

ALTER TABLE "RoundAnswer" ADD CONSTRAINT "RoundAnswer_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "TurnRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundAnswer" ADD CONSTRAINT "RoundAnswer_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundAnswer" ADD CONSTRAINT "RoundAnswer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
