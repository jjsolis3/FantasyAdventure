-- A television showing one adventure.
--
-- The screen in the living room has no account and never gets one. Signing a TV
-- into the household would put a session that can delete adventures on the
-- device with the least supervision in the house, kept alive by a browser
-- nobody signs out of — and it would have to be typed with a remote control.
--
-- So the TV asks to be adopted. It shows a code; somebody already holding the
-- adventure on their phone types that code in. The pairing happens on the
-- device that has a keyboard and an account, and the television only receives.
CREATE TABLE "ScreenPairing" (
    "id" TEXT NOT NULL,
    -- A doorbell, not a key: shown on the television while it waits, and
    -- cleared the moment it is claimed so a second household cannot ring it.
    "code" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    -- The key. Long, never displayed, never read aloud, stored hashed.
    "tokenHash" TEXT NOT NULL,
    -- Null until adopted. This column is the whole of the screen's authority.
    "campaignId" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreenPairing_pkey" PRIMARY KEY ("id")
);

-- Two screens must never wait on the same code at the same moment; NULLs are
-- distinct in Postgres, so claimed rows drop out of this constraint by clearing
-- their code rather than by needing a partial index.
CREATE UNIQUE INDEX "ScreenPairing_code_key" ON "ScreenPairing"("code");
CREATE UNIQUE INDEX "ScreenPairing_tokenHash_key" ON "ScreenPairing"("tokenHash");
CREATE INDEX "ScreenPairing_campaignId_idx" ON "ScreenPairing"("campaignId");
-- For sweeping up televisions that were turned off and never came back.
CREATE INDEX "ScreenPairing_lastSeenAt_idx" ON "ScreenPairing"("lastSeenAt");

-- Deleting the adventure unpairs every television showing it.
ALTER TABLE "ScreenPairing" ADD CONSTRAINT "ScreenPairing_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
