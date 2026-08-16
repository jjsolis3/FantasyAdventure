import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";
import { DressUp } from "@/components/character/dress-up";
import { PortraitUpload } from "@/components/character/portrait-upload";
import { DrawThem } from "@/components/character/draw-them";
import { Face } from "@/components/character/face";
import { earnedWearables, lookOf } from "@/lib/game/wardrobe";
import { characterPicture } from "@/lib/game/character-picture";
import { resolveImageConfig } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

/**
 * The dressing room.
 *
 * Its own page rather than another card on an already-long sheet, for two
 * reasons that pull the same way. It is the screen the girls will open most
 * often and for the longest, and it is the only screen in the game that is pure
 * pleasure — nothing here affects a roll, and it should not have to sit under a
 * stat allocator to be found.
 *
 * Only the household that owns her may dress her. Everything else about an
 * adventurer is readable by anybody at the table — bonds, deeds, her road — but
 * choosing somebody else's outfit is not a shared fact, it is playing with
 * somebody else's toy.
 */
export default async function LookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    include: {
      portrait: { select: { version: true } },
      art: { select: { version: true, lookKey: true } },
      inventory: {
        orderBy: { name: "asc" },
        select: { name: true, foundInCampaignId: true },
      },
    },
  });
  if (!character) notFound();

  // Titles for anything she is carrying that came out of an adventure. Read in
  // one go rather than per item, and missing titles are fine — an adventure the
  // family has tidied up leaves the cloak behind, which is the right way round.
  const campaignIds = [
    ...new Set(
      character.inventory
        .map((item) => item.foundInCampaignId)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const campaigns = campaignIds.length
    ? await db.campaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, title: true },
      })
    : [];

  // Asked once per page rather than letting the button find out by failing.
  const picturesOn = (await resolveImageConfig()) !== null;
  const picture = characterPicture({
    id: character.id,
    name: character.name,
    look: lookOf(character),
    portraitVersion: character.portrait?.version ?? null,
    art: character.art,
  });

  const earned = earnedWearables(
    character.inventory,
    new Map(campaigns.map((campaign) => [campaign.id, campaign.title])),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/characters/${character.id}`}
        className="text-sm text-hearth-300 underline hover:text-hearth-200"
      >
        ← {character.name}
      </Link>

      <div className="mt-3 flex items-start gap-4">
        <Face picture={picture} name={character.name} size={64} className="mt-1 shrink-0" />
        <PageTitle
          eyebrow="The dressing room"
          title={`How ${character.name} looks`}
          lead="Tap anything to try it on. Nothing here changes a dice roll — it is just for the look of them."
        />
      </div>

      <div className="space-y-6">
        <Card>
          <DressUp
            characterId={character.id}
            characterName={character.name}
            initial={lookOf(character)}
            earned={earned}
          />
        </Card>

        {/* Under the wardrobe rather than above it, because a drawing beats
            everything: a child who has drawn her adventurer in felt-tip wants
            *that* on the sheet, and no list of cloaks competes with it. */}
        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">Or draw them</h2>
          <p className="mb-3 text-sm text-hearth-400">
            A picture you drew beats anything the game can put together. Take a photograph of it and
            it goes on the sheet, on the television, and beside every answer they give.
          </p>
          <PortraitUpload
            characterId={character.id}
            characterName={character.name}
            version={character.portrait?.version ?? null}
          />

          <div className="mt-5 border-t border-hearth-800/60 pt-4">
            <DrawThem
              characterId={character.id}
              enabled={picturesOn}
              stale={picture.source === "GENERATED" && picture.stale}
              hasArt={character.art !== null}
            />
          </div>
        </Card>
      </div>
    </main>
  );
}
