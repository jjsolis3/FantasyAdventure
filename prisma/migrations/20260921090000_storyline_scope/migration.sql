-- Adventures belong to somebody.
--
-- Every storyline was installation-wide, and only whoever ran the server could
-- write one. Right while one family played; the same leak households were built
-- to close the moment two do — a family's homemade adventure about their own
-- house would appear in every other family's setup list.
--
-- **Everything that already exists stays SYSTEM**, including the ones written in
-- the app. They are visible to everybody today, and retroactively assigning them
-- to whichever household happens to be first would take them away from every
-- other family on the installation — a behaviour change nobody asked for,
-- applied by a migration that could not be argued with. Moving one into a
-- household is a decision, and there is a control for it.
--
-- So this ships behaving exactly as before: one scope, every row in it.

CREATE TYPE "StorylineScope" AS ENUM ('SYSTEM', 'HOUSEHOLD', 'COMMUNITY');

ALTER TABLE "Storyline" ADD COLUMN "scope" "StorylineScope" NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE "Storyline" ADD COLUMN "householdId" TEXT;

-- SET NULL, not CASCADE. A campaign points at its storyline for the premise and
-- the act it is in, so deleting one would take the spine out of a story halfway
-- through being told — which is why this app has no storyline delete at all. If
-- a household ever goes, its adventures are left ownerless instead: nobody sees
-- them in a picker again, because HOUSEHOLD with a null household matches no
-- family, and every journal written about one still reads.
ALTER TABLE "Storyline"
  ADD CONSTRAINT "Storyline_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Storyline_scope_householdId_idx" ON "Storyline"("scope", "householdId");
