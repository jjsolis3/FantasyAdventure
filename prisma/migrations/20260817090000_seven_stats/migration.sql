-- Grace, Luck and Grit.
--
-- Four stats was thin: spreading twelve points over four sliders is not really a
-- decision, and every adventurer came out much like every other one.
--
-- The default of 3 is the whole migration strategy, and it is exact rather than
-- convenient. Three is the value that rolls at +0 (see `statModifier`), and the
-- point budget is defined as three per stat — so it moves from 12 across four to
-- 21 across seven at the same moment these columns appear. An existing character
-- on twelve points lands on twenty-one: precisely the new budget, nothing gained
-- and nothing lost.
--
-- A character part-way through growing is equally safe. Unspent points are
-- measured as `total - budget`, and both sides rise by nine, so she keeps every
-- point she had earned and not yet spent.
ALTER TABLE "Character" ADD COLUMN "grace" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Character" ADD COLUMN "luck"  INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Character" ADD COLUMN "grit"  INTEGER NOT NULL DEFAULT 3;
