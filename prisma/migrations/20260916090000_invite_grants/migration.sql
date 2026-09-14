-- Invitations that say what they grant.
--
-- A code used to mean exactly one thing: "you may create an account". What that
-- account then *became* was decided somewhere else entirely — by counting the
-- users table at the moment of registration — and where it belonged was not
-- decided at all, because there was nowhere for it to belong.
--
-- That is the wrong place for both decisions. Whether somebody starts a
-- household of their own or joins an existing one is a fact about the
-- invitation, known by the person writing it, and inferring it later from row
-- counts is how "whoever registers first gets the keys" happened.
--
-- ## The rule the columns exist to enforce
--
-- Only whoever runs the installation may hand out a NEW_HOUSEHOLD code. That is
-- how a new family is admitted, and no family may admit another — a parent
-- invites their own children and nobody else's.
--
-- `householdId` is taken from the session of whoever created the code and never
-- from the form, so a parent cannot address an invitation at another family's
-- house even by hand-posting one. The column is here so that rule has something
-- to be written down in; the enforcement is in `createInviteAction`.
--
-- ## What happens to the codes already out there
--
-- Every existing code is stamped HOUSEHOLD_MEMBER and pointed at its creator's
-- household, which is what each of them effectively already was: one person's
-- invitation into their own house. A code whose creator has since been deleted
-- — `createdById` is SET NULL — keeps a null household and behaves like the
-- codes did yesterday, making a household of its own. Nobody holding an unspent
-- code finds it has changed meaning underneath them.
--
-- The bootstrap code is deliberately left alone. It is the way into an empty
-- installation, there is no household for it to join, and a NEW_HOUSEHOLD stamp
-- would be redundant: a null household already means "make one".

CREATE TYPE "InviteGrant" AS ENUM ('NEW_HOUSEHOLD', 'HOUSEHOLD_MEMBER');

ALTER TABLE "InviteCode" ADD COLUMN "grant" "InviteGrant" NOT NULL DEFAULT 'HOUSEHOLD_MEMBER';
ALTER TABLE "InviteCode" ADD COLUMN "householdId" TEXT;
ALTER TABLE "InviteCode" ADD COLUMN "intendedRole" "HouseholdRole";
ALTER TABLE "InviteCode" ADD COLUMN "forName" TEXT;

-- Point each existing code at the household of whoever wrote it. The guard on
-- `isBootstrap` is not strictly needed — a bootstrap code has no creator — but
-- saying so is cheaper than somebody later wondering whether it was considered.
UPDATE "InviteCode" i
   SET "householdId" = m."householdId"
  FROM "HouseholdMember" m
 WHERE i."createdById" = m."userId"
   AND i."householdId" IS NULL
   AND i."isBootstrap" = false;

CREATE INDEX "InviteCode_householdId_idx" ON "InviteCode"("householdId");

-- CASCADE, unlike the soft references elsewhere in this schema: an invitation
-- into a household that no longer exists is not a historical record worth
-- keeping, it is a code that would redeem into nothing.
ALTER TABLE "InviteCode"
  ADD CONSTRAINT "InviteCode_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
