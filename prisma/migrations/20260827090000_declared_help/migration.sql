-- "I'm helping with that."
--
-- Working together used to be findable only by the adjudicator reading two
-- separately-typed sentences and inferring they served one plan. A real session
-- ran ten turns of three players constantly asking each other for things and it
-- found none of it — every bond finished at zero. A rule nobody can invoke and
-- a model routinely misses is not a rule.
--
-- SET NULL rather than cascade: an adventurer leaving the party should not take
-- somebody else's answer with her.
ALTER TABLE "RoundAnswer" ADD COLUMN "helpingCharacterId" TEXT;

CREATE INDEX "RoundAnswer_helpingCharacterId_idx" ON "RoundAnswer"("helpingCharacterId");

ALTER TABLE "RoundAnswer" ADD CONSTRAINT "RoundAnswer_helpingCharacterId_fkey"
  FOREIGN KEY ("helpingCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
