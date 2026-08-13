-- A picture of one chapter of one adventure, shared by every family who plays it.
--
-- Keyed by the storyline's slug and act number rather than the act's id, and
-- that is the whole point of the design. The seed deletes and recreates every
-- StorylineAct row on container start, so art hung off an act id would be
-- destroyed by the next redeploy — which is precisely when somebody would have
-- just finished adding it. Slug and number survive a reseed, and they are also
-- what `npm run art:prompts` names its suggested files after.
CREATE TABLE "ChapterImage" (
    "id" TEXT NOT NULL,
    "storylineSlug" TEXT NOT NULL,
    "actIndex" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChapterImage_pkey" PRIMARY KEY ("id")
);

-- One picture per chapter. Uploading again replaces rather than piling up.
CREATE UNIQUE INDEX "ChapterImage_storylineSlug_actIndex_key"
    ON "ChapterImage"("storylineSlug", "actIndex");

ALTER TABLE "ChapterImage" ADD CONSTRAINT "ChapterImage_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
