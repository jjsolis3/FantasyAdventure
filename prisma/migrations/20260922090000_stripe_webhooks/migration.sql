-- The receiving end of billing.
--
-- Three columns and a table, all of which exist because a webhook is not a
-- function call: it arrives more than once, it arrives out of order, and it
-- arrives from outside.
--
-- Nothing here changes behaviour for anybody. Every existing subscription is
-- UNMETERED on a self-hosted installation, no Stripe account is configured, and
-- the new columns stay null until one is.

-- Ordering. A retry after a blip can deliver an older `subscription.updated`
-- *after* the cancellation that followed it, leaving a family showing the wrong
-- state for ever. Refusing anything older than this is the whole fix.
ALTER TABLE "Subscription" ADD COLUMN "lastEventAt" TIMESTAMP(3);

-- When a parent was verified as a parent, and how. A payment from the parent's
-- own card is one of the methods the FTC recognises for COPPA's verifiable
-- parental consent, so the moment a subscription first goes live is the moment
-- that test is passed — and a record written then costs nothing, where one
-- reconstructed afterwards from a processor's invoices is a bad afternoon.
ALTER TABLE "Subscription" ADD COLUMN "consentedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "consentMethod" TEXT;

-- Deduplication, keyed on Stripe's own event id so that the insert *is* the
-- check: catching the unique violation leaves no read-then-write race to lose.
-- Everything else in this schema has a `cuid()`; this deliberately does not.
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- For pruning. Anything older than Stripe's three-day retry window can never
-- arrive again, so this table has a natural ceiling however long it is left.
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");
