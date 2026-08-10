-- Two things a family asked for after playing a while.
--
-- A third tone, because the cosy end of the shelf is not the whole shelf and a
-- ten-year-old who reads Goosebumps is not served by "nothing lurks". What sits
-- underneath every tone is untouched: nobody dies, nobody is hurt, and there is
-- always a way through.
--
-- And a list, per act, of what the party is meant to come away holding — so
-- that "we still need the brass key" can be on a screen rather than in
-- somebody's head.

ALTER TYPE "Tone" ADD VALUE 'SPOOKY';

-- No column default, because the schema declares none and a default the schema
-- does not know about shows up as drift on the next migration. Existing acts
-- are filled in instead, so nothing is left holding NULL.
ALTER TABLE "StorylineAct" ADD COLUMN "seeks" TEXT[];
UPDATE "StorylineAct" SET "seeks" = ARRAY[]::TEXT[] WHERE "seeks" IS NULL;
