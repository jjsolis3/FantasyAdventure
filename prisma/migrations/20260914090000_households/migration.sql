-- Households: the word in the comments, finally given a table.
--
-- "Household" has meant *one account* since the beginning. That was true while
-- one family played. It stops being true the moment a second family is invited,
-- because the party-invite picker offers every character in the database — fine
-- when everyone in the database is yours, and a leak when they are not.
--
-- ## Why the id is written down rather than worked out
--
-- `Character` and `Campaign` already know who owns them, so the household could
-- be reached by joining through that account. It deliberately is not.
--
-- A derived boundary fails open. Forget the filter and `findMany` quietly
-- returns every family's children, and the code looks right. A column fails
-- closed, greps cleanly, and is the thing row-level security would key on if
-- this ever holds more than one family who paid to be here. It is also the
-- difference between a cheap change and an expensive one: back-filling three
-- columns across a handful of rows today costs nothing, and doing it once
-- strangers are in the database is a migration with downtime.
--
-- `userId` and `ownerId` stay exactly as they are. "Who may edit this" and
-- "whose data is this" are different questions and the app needs both.
--
-- ## Nobody is grouped by guessing
--
-- This cannot know which accounts are one family — a household with a login
-- each looks exactly like three separate households. So it does not guess: one
-- household per existing account, named from the display name. A household of
-- one is a real thing, and putting two of them together is a decision a person
-- makes on a screen afterwards.
--
-- Ids are derived from the account's own id rather than generated, so the
-- backfill correlates without a temporary table and can be re-run. `md5` is
-- built into Postgres — no pgcrypto, because the version this deploys onto is
-- not pinned by this repository.

CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'PARENT', 'MEMBER');

CREATE TABLE "Household" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "linkCode"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Household_linkCode_key" ON "Household"("linkCode");

CREATE TABLE "HouseholdMember" (
    "id"          TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "role"        "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key"
  ON "HouseholdMember"("householdId", "userId");
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");

ALTER TABLE "HouseholdMember"
  ADD CONSTRAINT "HouseholdMember_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdMember"
  ADD CONSTRAINT "HouseholdMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ## One household per account that already exists
--
-- The link code is a placeholder in the app's own alphabet — the one that
-- excludes look-alikes so a code can be read aloud across a kitchen table. Any
-- owner can rotate theirs from the household screen.

INSERT INTO "Household" ("id", "name", "linkCode", "createdAt", "updatedAt")
SELECT 'hh_' || u."id",
       u."displayName" || '''s household',
       'KIN-' || upper(substr(translate(md5(u."id"), 'ilo01', 'PQRST'), 1, 4))
              || '-'
              || upper(substr(translate(md5(u."id" || 'kin'), 'ilo01', 'PQRST'), 1, 4)),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "User" u;

-- Everyone answers for the household they are alone in. When two of these are
-- merged afterwards, the screen doing the merging decides who stays OWNER.
INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role", "createdAt")
SELECT 'hm_' || u."id", 'hh_' || u."id", u."id", 'OWNER', CURRENT_TIMESTAMP
FROM "User" u;

-- ## The tenant columns
--
-- Added nullable, back-filled through the owner each row already has, then
-- constrained — the shape used by `20260824090000_build_budget`, because a
-- NOT NULL column cannot be added to a populated table in one step.

ALTER TABLE "Character" ADD COLUMN "householdId" TEXT;
UPDATE "Character" SET "householdId" = 'hh_' || "userId" WHERE "householdId" IS NULL;
ALTER TABLE "Character" ALTER COLUMN "householdId" SET NOT NULL;

ALTER TABLE "Campaign" ADD COLUMN "householdId" TEXT;
UPDATE "Campaign" SET "householdId" = 'hh_' || "ownerId" WHERE "householdId" IS NULL;
ALTER TABLE "Campaign" ALTER COLUMN "householdId" SET NOT NULL;

-- Usage records stay nullable. An `AiCall` whose campaign was already deleted
-- has no honest answer — `campaignId` is SET NULL on delete, which is exactly
-- the reason this column exists — and inventing one would put a made-up number
-- in the only table that could ever be billed from. Null means "before
-- households"; nothing written from here on leaves it empty.
ALTER TABLE "AiCall" ADD COLUMN "householdId" TEXT;
UPDATE "AiCall" a
   SET "householdId" = c."householdId"
  FROM "Campaign" c
 WHERE a."campaignId" = c."id" AND a."householdId" IS NULL;

CREATE INDEX "Character_householdId_idx" ON "Character"("householdId");
CREATE INDEX "Campaign_householdId_idx" ON "Campaign"("householdId");
CREATE INDEX "AiCall_householdId_createdAt_idx" ON "AiCall"("householdId", "createdAt");

ALTER TABLE "Character"
  ADD CONSTRAINT "Character_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE, for the same reason the column is nullable: a
-- household going away should not take the record of what it cost with it.
ALTER TABLE "AiCall"
  ADD CONSTRAINT "AiCall_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
