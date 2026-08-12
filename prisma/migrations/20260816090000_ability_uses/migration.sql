-- What a character has spent, and in which window.
--
-- Modelled on FamilyMoveUse, which was for a long time the only limit in the
-- game that a limit actually was. Archetype signatures said "once a scene" in
-- their own doc comment; Steady Hand and two knacks said "once a chapter" in
-- the text a child reads. Nothing anywhere counted. The prompt went further and
-- told the storyteller the signature was something the character "can always"
-- do, so the last place the rule could have been enforced was told the opposite.
CREATE TYPE "AbilityKind" AS ENUM ('SIGNATURE', 'KNACK', 'RANK');

CREATE TABLE "AbilityUse" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "kind" "AbilityKind" NOT NULL,
    "abilityKey" TEXT NOT NULL,
    -- The window the limit is measured in: 'scene:<id>' or 'act:<index>'.
    -- One string rather than two nullable columns with a conditional
    -- constraint, because a partial unique index covering only half the rows is
    -- how a "once a chapter" ability quietly becomes unlimited.
    "windowKey" TEXT NOT NULL,
    "usedAtTurn" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbilityUse_pkey" PRIMARY KEY ("id")
);

-- The whole rule, in one constraint.
CREATE UNIQUE INDEX "AbilityUse_characterId_abilityKey_windowKey_key"
    ON "AbilityUse"("characterId", "abilityKey", "windowKey");
CREATE INDEX "AbilityUse_campaignId_idx" ON "AbilityUse"("campaignId");
CREATE INDEX "AbilityUse_campaignId_characterId_idx" ON "AbilityUse"("campaignId", "characterId");

ALTER TABLE "AbilityUse" ADD CONSTRAINT "AbilityUse_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AbilityUse" ADD CONSTRAINT "AbilityUse_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which ability a girl is spending on this answer, chosen alongside what she
-- types. Held on the answer rather than picked once at review the way a Family
-- Move is, because a signature belongs to one person rather than to a pair.
ALTER TABLE "RoundAnswer" ADD COLUMN "abilityKey" TEXT;
