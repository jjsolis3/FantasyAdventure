-- Twelve means twelve, and three adventures that would not let go.
--
-- ## The budget
--
-- A level-one adventurer's seven numbers now add up to 12 rather than 19. The
-- default on `buildBudget` moves with it so new characters are measured against
-- the new rule.
--
-- Existing rows are deliberately NOT touched. `buildBudget` records what each
-- adventurer actually started with, and every growth calculation measures
-- against that column — so a character built under the old rule keeps her 19
-- and loses nothing. This is the second time the budget has moved, and that
-- column is why neither move cost anybody a point.
--
-- ## The foreign keys
--
-- Three tables added a day earlier stored a `campaignId` with no constraint
-- behind it, so deleting an adventure left a dangling id pointing at nothing.
-- The campaign *title* is kept on each row on purpose — the thing still
-- happened, and the history should read correctly afterwards — but the id
-- should be nulled rather than left to rot. Every id that no longer resolves is
-- cleaned up first, then the constraint is added to keep it that way.
--
-- Five older columns hold a campaign id the same loose way and are deliberately
-- left alone: `Acquaintance.metInCampaignId`, `Rival.lastSeenCampaignId`,
-- `Companion.countedCampaignId`, `Dream.answeredInCampaignId` and
-- `InventoryItem.foundInCampaignId`. Four of them are only ever compared
-- against the campaign being played, so a stale id and a null behave alike and
-- there is nothing to fix. The fifth is the reason not to do this by reflex:
-- `knownPeople` asks for `NOT: { metInCampaignId: <this adventure> }`, and
-- Prisma's NOT drops null rows, so nulling that column on delete would quietly
-- remove somebody from "people the family already knows" the moment the
-- adventure they were met in was tidied away. Constraining those five means
-- fixing that filter first, which is a change of its own and not this one's.

ALTER TABLE "Character" ALTER COLUMN "buildBudget" SET DEFAULT 12;

-- Clean up anything already dangling, so the constraints can be trusted.
UPDATE "DreamEcho" SET "campaignId" = NULL
  WHERE "campaignId" IS NOT NULL
    AND "campaignId" NOT IN (SELECT "id" FROM "Campaign");

UPDATE "RivalMeeting" SET "campaignId" = NULL
  WHERE "campaignId" IS NOT NULL
    AND "campaignId" NOT IN (SELECT "id" FROM "Campaign");

UPDATE "Companion" SET "foundInCampaignId" = NULL
  WHERE "foundInCampaignId" IS NOT NULL
    AND "foundInCampaignId" NOT IN (SELECT "id" FROM "Campaign");

ALTER TABLE "DreamEcho"
  ADD CONSTRAINT "DreamEcho_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RivalMeeting"
  ADD CONSTRAINT "RivalMeeting_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Companion"
  ADD CONSTRAINT "Companion_foundInCampaignId_fkey"
  FOREIGN KEY ("foundInCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
