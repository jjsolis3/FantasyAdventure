-- Two dials the family asked for: how hard the dice are, and how the
-- storyteller plays.
--
-- Both default to the behaviour that existed before them, so every adventure
-- already under way is unchanged by this migration. Nothing is backfilled and
-- nothing is recomputed.

CREATE TYPE "Challenge" AS ENUM ('GENTLE', 'BALANCED', 'TOUGH');
CREATE TYPE "GmManner" AS ENUM ('STRAIGHT', 'BALANCED', 'PLAYFUL', 'MADCAP');

ALTER TABLE "Campaign"
  ADD COLUMN "challenge" "Challenge" NOT NULL DEFAULT 'BALANCED',
  ADD COLUMN "manner" "GmManner" NOT NULL DEFAULT 'BALANCED';
