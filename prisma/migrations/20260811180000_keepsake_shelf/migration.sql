-- Keepsakes learn which adventure they came from.
--
-- The column was always there; what was missing was a way to turn it into the
-- adventure's name, so a shelf spanning several stories could group them.
--
-- SET NULL rather than CASCADE on purpose: giving something up happened to her
-- whether or not the record of the story survives it. A shelf that silently
-- drops a row is worse than one that says "an adventure since forgotten".
CREATE INDEX "Keepsake_campaignId_idx" ON "Keepsake"("campaignId");

ALTER TABLE "Keepsake" ADD CONSTRAINT "Keepsake_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
