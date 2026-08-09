-- Token counts per model call, so a hosted model's cost can be added up from
-- what actually happened rather than estimated. Null for providers that do not
-- report usage, which includes most local servers.
ALTER TABLE "AiCall" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "AiCall" ADD COLUMN "outputTokens" INTEGER;
