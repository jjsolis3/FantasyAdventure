-- Controls `reasoning_effort` on OpenAI-compatible requests.
--
-- NULL means the field is omitted from the request, which is required for
-- providers that reject unrecognised values. "none" disables thinking on
-- models that do it by default -- without it, a hybrid reasoning model can
-- spend its whole output budget reasoning and return an empty answer.
ALTER TABLE "AiSetting" ADD COLUMN "reasoningEffort" TEXT;
