-- The wardrobe.
--
-- Six nullable columns and no backfill, because there is nothing to backfill
-- from: what an existing character looks like is a paragraph of free text in
-- `description`, and splitting an English sentence into a hairstyle and a cloak
-- is exactly the kind of guess that gets somebody's daughter's adventurer
-- wrong. Existing characters keep their description untouched and open the
-- dress-up screen with every slot empty, which is an invitation.
--
-- Separate columns rather than one JSON blob: these are picked one at a time by
-- a form and read one at a time by a picker, and a wardrobe slot is exactly as
-- much of a field as `race` is.
ALTER TABLE "Character" ADD COLUMN "lookHair" TEXT;
ALTER TABLE "Character" ADD COLUMN "lookOutfit" TEXT;
ALTER TABLE "Character" ADD COLUMN "lookLayer" TEXT;
ALTER TABLE "Character" ADD COLUMN "lookArmour" TEXT;
ALTER TABLE "Character" ADD COLUMN "lookColour" TEXT;
ALTER TABLE "Character" ADD COLUMN "lookSignature" TEXT;
