-- What each adventurer was built with.
--
-- A new character now starts at 1 in everything with 12 points to spend — 19 in
-- total — rather than being handed 3 in all seven. Growth is measured as how far
-- her stats have risen above what she *started* with, so without this column
-- every adventurer already in the house would appear to have spent two points
-- she never spent: silently, with no message, taking two earned growth points
-- off a child.
--
-- So: existing rows keep 21, and only characters built from here on get 19.
ALTER TABLE "Character" ADD COLUMN "buildBudget" INTEGER NOT NULL DEFAULT 19;

UPDATE "Character" SET "buildBudget" = 21;
