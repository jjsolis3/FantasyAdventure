-- Handing an adventurer to the player who is actually playing them.
--
-- Characters were built by whoever was holding the keyboard, which for most
-- families is one adult building everybody. Now that each player can sign in
-- for themselves, they need their own adventurer rather than a copy of them —
-- and a copy is worse than nothing, because a copy is level 1.
--
-- Nothing but this column moves. Experience, skills, what they are carrying,
-- their bonds and their place in a party all hang off the character's id.

ALTER TABLE "Character" ADD COLUMN "handoverCode" TEXT;

CREATE UNIQUE INDEX "Character_handoverCode_key" ON "Character"("handoverCode");
