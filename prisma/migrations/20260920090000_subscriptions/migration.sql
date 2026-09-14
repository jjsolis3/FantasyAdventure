-- Subscriptions: what a family is paying for, if anything.
--
-- Every household gets a row, because a household with no subscription is a
-- fault rather than a state to handle quietly, and `entitlementsFor` treats it
-- as one by resolving to the smallest allowance. A backfill here means that
-- path is never taken in practice.
--
-- **Existing households are given UNMETERED, deliberately.** They are on a
-- self-hosted installation talking to a local model, and nobody on it agreed to
-- a turn limit. Retrospectively capping a family that has been playing for
-- months, because the software grew a billing table, would be a worse thing to
-- do than not having caps at all. Households registered from here on start on
-- whatever `DEFAULT_PLAN` says — also UNMETERED unless an operator selling
-- subscriptions sets it to HEARTH.

CREATE TYPE "Plan" AS ENUM ('HEARTH', 'HOMESTEAD', 'KEEP', 'UNMETERED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'UNMETERED',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "externalCustomerId" TEXT,
    "externalSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_householdId_key" ON "Subscription"("householdId");
CREATE UNIQUE INDEX "Subscription_externalCustomerId_key" ON "Subscription"("externalCustomerId");
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per household that already exists. The id is derived from the
-- household's own, in the idiom `20260914090000_households` established, so
-- this stays pure SQL with no extension — the deploy's Postgres version is not
-- pinned by this repository and pgcrypto cannot be assumed.
--
-- `currentPeriodStart` is the household's own creation date rather than now:
-- the period is rolled forward arithmetically from it, so a family that
-- registered on the 9th keeps being metered from the 9th.
INSERT INTO "Subscription" (
  "id", "householdId", "plan", "status", "currentPeriodStart", "createdAt", "updatedAt"
)
SELECT 'sub_' || h."id",
       h."id",
       'UNMETERED',
       'ACTIVE',
       h."createdAt",
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Household" h;
