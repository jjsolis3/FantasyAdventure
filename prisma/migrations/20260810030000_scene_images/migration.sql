-- Pictures of the places the party has been.
--
-- One per scene, drawn on request rather than on every turn, and kept in the
-- database: the container is replaced on every deployment, and a picture of the
-- night the dragon learned her name should outlive a redeploy.

ALTER TABLE "AiSetting"
    ADD COLUMN "imagesEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "imageBaseUrl" TEXT,
    ADD COLUMN "imageModel" TEXT,
    ADD COLUMN "imageApiKeyCipher" TEXT,
    ADD COLUMN "imageApiKeyHint" TEXT;

CREATE TABLE "SceneImage" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneImage_pkey" PRIMARY KEY ("id")
);

-- One per scene, which is also what stops two browsers both paying for one.
CREATE UNIQUE INDEX "SceneImage_sceneId_key" ON "SceneImage"("sceneId");

ALTER TABLE "SceneImage" ADD CONSTRAINT "SceneImage_sceneId_fkey"
    FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
