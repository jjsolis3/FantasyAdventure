-- Records when an adventure actually finished. Until now nothing ever set the
-- COMPLETE status, because the final act advanced to an act index that did not
-- exist instead of ending the story.
ALTER TABLE "Campaign" ADD COLUMN "completedAt" TIMESTAMP(3);
