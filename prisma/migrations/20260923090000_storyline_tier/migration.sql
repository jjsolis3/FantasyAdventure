-- Five adventures come with every plan; the rest come with a paid one.
--
-- A property of the adventure rather than a number on the plan, deliberately.
-- "The first five" would mean the set silently changes the day somebody
-- reorders the library, and a family part-way through number six would find it
-- gone — which is the one thing a cap must never do.
--
-- **This changes nothing for anybody today.** Every household on this
-- installation is UNMETERED, and UNMETERED includes the extras; the split only
-- becomes visible to a family on the free plan, which is a family that does not
-- exist until somebody sets DEFAULT_PLAN=HEARTH and starts selling.

CREATE TYPE "StorylineTier" AS ENUM ('STARTER', 'EXTRA');

ALTER TABLE "Storyline" ADD COLUMN "tier" "StorylineTier" NOT NULL DEFAULT 'STARTER';

-- The five oldest shipped adventures stay STARTER; everything else that came
-- with the game becomes EXTRA. Oldest rather than alphabetical because the seed
-- writes them in the order they are meant to be met, and the first five are the
-- gentlest — which is the right set for a family finding out whether their
-- children like this at all.
--
-- Anything a household *wrote* is left alone. Their own adventure is theirs
-- whatever they pay, and `STARTER` is the default that says so.
WITH ranked AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS position
  FROM "Storyline"
  WHERE "scope" = 'SYSTEM'
)
UPDATE "Storyline" s
SET "tier" = 'EXTRA'
FROM ranked
WHERE s."id" = ranked."id" AND ranked.position > 5;

CREATE INDEX "Storyline_tier_idx" ON "Storyline"("tier");
