-- Pictures the family drew.
--
-- Scene art has always been generated — asked for from whatever drawing model
-- the household configured, which most have not, and which in any case produces
-- one interpretation of a chapter rather than the family's own.
--
-- This is the other half, and the better one: a child draws the beekeeper in
-- felt-tip on a Tuesday and he is on the television that evening, with his own
-- face, for the rest of the adventure. A generated picture is content; a drawn
-- one is a memento, and this game is built around mementos.
--
-- One table for people, places and chapters rather than three, because the
-- question asked of it is always the same: is there a picture of this thing,
-- and which bytes are it.
CREATE TYPE "CampaignImageKind" AS ENUM ('SCENE', 'PERSON', 'PLACE');

CREATE TABLE "CampaignImage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "CampaignImageKind" NOT NULL,
    -- A scene id for SCENE, a normalised name for PERSON and PLACE.
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    -- Bumped on replacement: pictures are served with a long cache life, so
    -- without this a redrawn one would stay the old one on every device that
    -- had already seen it.
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignImage_pkey" PRIMARY KEY ("id")
);

-- One picture per thing. Uploading again replaces rather than piles up.
CREATE UNIQUE INDEX "CampaignImage_campaignId_kind_key_key"
    ON "CampaignImage"("campaignId", "kind", "key");
CREATE INDEX "CampaignImage_campaignId_idx" ON "CampaignImage"("campaignId");

ALTER TABLE "CampaignImage" ADD CONSTRAINT "CampaignImage_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The uploader is set to null rather than cascading: the picture belongs to the
-- adventure now, not to whoever happened to press the button.
ALTER TABLE "CampaignImage" ADD CONSTRAINT "CampaignImage_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
