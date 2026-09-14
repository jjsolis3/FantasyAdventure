-- Two households that have agreed to adventure together.
--
-- This is the table the whole boundary was built for. Until now households
-- existed and nothing read them: every screen that asks "who can I see?" still
-- answers "everybody in the database". This is what lets the answer be "my own
-- family, and the families we have agreed to play with".
--
-- ## Why there is no pending column
--
-- A `Relationship` carries `proposedById` and `confirmedAt` because it asserts
-- something about somebody else's character, and that claim earns real bond
-- levels. A link asserts nothing. One household shares its `linkCode`; the
-- other redeems it. Sharing is one consent and redeeming is the other, and the
-- row existing is the whole of what "both sides agreed" needs to mean.
--
-- ## Why the pair is sorted
--
-- Stored canonically — smaller id first — so two households are one row
-- whichever of them typed the code. Without that the unique constraint is
-- decorative: (A,B) and (B,A) would both be insertable and every read would
-- have to look in two directions forever. Same idiom as `canonicalPair` for
-- ties, and the application is what sorts them; a check constraint saying
-- `"householdAId" < "householdBId"` is tempting but would turn an application
-- bug into a 500 in front of a child rather than a refusal.
--
-- ## Nothing is back-filled
--
-- There is nothing to back-fill *to*. No two households have agreed to anything
-- yet, and inventing links between the households the A1 migration created
-- would be exactly the guess that migration refused to make. Every family on
-- this installation starts unlinked, which is also the safe direction: the
-- first deploy after this narrows what people can see, it does not widen it.

CREATE TABLE "HouseholdLink" (
    "id" TEXT NOT NULL,
    "householdAId" TEXT NOT NULL,
    "householdBId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdLink_householdAId_householdBId_key"
    ON "HouseholdLink"("householdAId", "householdBId");

-- The A side is covered by the unique index above; the B side needs its own,
-- because every read asks "which households is mine linked to?" and that
-- question has to be answered from both directions.
CREATE INDEX "HouseholdLink_householdBId_idx" ON "HouseholdLink"("householdBId");

-- CASCADE on the households: a link to a household that no longer exists is not
-- history worth keeping, it is a row that would widen somebody's visibility to
-- nothing. SET NULL on the person: the link belongs to the two families, not to
-- whoever happened to type the code.
ALTER TABLE "HouseholdLink"
  ADD CONSTRAINT "HouseholdLink_householdAId_fkey"
  FOREIGN KEY ("householdAId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdLink"
  ADD CONSTRAINT "HouseholdLink_householdBId_fkey"
  FOREIGN KEY ("householdBId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdLink"
  ADD CONSTRAINT "HouseholdLink_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
