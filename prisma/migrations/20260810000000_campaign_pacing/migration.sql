-- How long the family wants an adventure to run. Feeds the storyteller's
-- decision about when an act has gone on long enough, which until now it made
-- with nothing to go on.
CREATE TYPE "Pacing" AS ENUM ('BRISK', 'STANDARD', 'LEISURELY');

ALTER TABLE "Campaign" ADD COLUMN "pacing" "Pacing" NOT NULL DEFAULT 'STANDARD';
