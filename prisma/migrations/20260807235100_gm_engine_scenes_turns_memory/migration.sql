-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TurnEventType" AS ENUM ('NARRATION', 'PLAYER_ACTION', 'DICE_ROLL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('FACT', 'NPC', 'PLACE', 'PLOT_THREAD');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "turnCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "summary" TEXT,
    "actIndex" INTEGER NOT NULL DEFAULT 1,
    "status" "SceneStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnEvent" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "type" "TurnEventType" NOT NULL,
    "actorCharacterId" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "lastSeenAt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "stage" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "repairs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "promptPreview" TEXT,
    "responsePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scene_campaignId_status_idx" ON "Scene"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_campaignId_index_key" ON "Scene"("campaignId", "index");

-- CreateIndex
CREATE INDEX "TurnEvent_sceneId_idx" ON "TurnEvent"("sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "TurnEvent_sceneId_ordinal_key" ON "TurnEvent"("sceneId", "ordinal");

-- CreateIndex
CREATE INDEX "Memory_campaignId_importance_idx" ON "Memory"("campaignId", "importance");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_campaignId_kind_key_key" ON "Memory"("campaignId", "kind", "key");

-- CreateIndex
CREATE INDEX "AiCall_campaignId_createdAt_idx" ON "AiCall"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnEvent" ADD CONSTRAINT "TurnEvent_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
