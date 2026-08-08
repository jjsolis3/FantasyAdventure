-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('OPENAI_COMPATIBLE', 'ANTHROPIC');

-- CreateTable
CREATE TABLE "AiSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "kind" "AiProviderKind" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "narrationModel" TEXT,
    "apiKeyCipher" TEXT,
    "apiKeyHint" TEXT,
    "maxContextTokens" INTEGER NOT NULL DEFAULT 3000,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);
