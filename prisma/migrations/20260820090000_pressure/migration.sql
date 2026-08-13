-- The act clock.
--
-- Defaults matter here for the same reason they did for the three new stats: an
-- adventure already in progress must cross this migration without noticing.
-- Zero is "nothing has gone wrong yet", which is true of every campaign that
-- existed before the clock did.
ALTER TABLE "Campaign" ADD COLUMN "pressure" INTEGER NOT NULL DEFAULT 0;

-- What the clock is called in each adventure's own words. The generic default
-- is deliberately dull, so a storyline that has not been given a real one reads
-- as unfinished rather than as broken; the seed sets a proper name for all ten.
ALTER TABLE "Storyline" ADD COLUMN "pressureName" TEXT NOT NULL DEFAULT 'The clock';
