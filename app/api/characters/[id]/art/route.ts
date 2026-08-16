import { db } from "@/lib/db";
import { requireUserForApi } from "@/lib/auth/session";
import { resolveImageConfig } from "@/lib/ai/settings";
import { ImagesUnavailableError, drawScene, portraitPrompt } from "@/lib/ai/images";
import { lookOf, lookSentence } from "@/lib/game/wardrobe";
import { lookKey } from "@/lib/game/character-picture";

export const dynamic = "force-dynamic";

/**
 * A portrait drawn from the wardrobe.
 *
 * **Asked for, never automatic.** A picture costs real money and takes the
 * better part of a minute, and this one is decoration — nobody's turn is
 * waiting on it. Drawing every adventurer the moment somebody picks a cloak
 * would be a bill nobody agreed to for pictures nobody asked to see. So it
 * happens when a child taps a button, and only then.
 *
 * The generated picture is stored beside the uploaded one rather than in it.
 * Neither can overwrite the other, which is the whole reason `CharacterArt`
 * exists: a felt-tip drawing is the best picture in the game and a machine must
 * never be able to replace it.
 */

/** Serves it, to anybody who shares an adventure with them. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  // Same audience as the uploaded portrait: her household, or anybody at a
  // table she is playing at. This face already appears on the party sheets
  // every player can see.
  const character = await db.character.findFirst({
    where: {
      id,
      OR: [
        { userId: user.id },
        {
          partyMemberships: {
            some: {
              campaign: {
                OR: [{ ownerId: user.id }, { party: { some: { character: { userId: user.id } } } }],
              },
            },
          },
        },
      ],
    },
    select: { art: true },
  });

  if (!character?.art) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(character.art.data), {
    headers: {
      "Content-Type": character.art.mimeType,
      "Content-Length": String(character.art.data.length),
      // Immutable against the version in the URL; redrawing changes the URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Draws one. Only the household that owns her, and only when asked. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForApi();
  if (user instanceof Response) return user;

  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      name: true,
      race: true,
      archetype: true,
      ageBand: true,
      lookHair: true,
      lookOutfit: true,
      lookLayer: true,
      lookArmour: true,
      lookColour: true,
      lookSignature: true,
      // The tone of an adventure she is actually in, so a portrait for a spooky
      // story is lit like one. Any of them will do — a family playing two at
      // once will get whichever, and either is a better answer than none.
      partyMemberships: {
        take: 1,
        orderBy: { campaign: { lastPlayedAt: "desc" } },
        select: { campaign: { select: { tone: true } } },
      },
    },
  });
  if (!character) return Response.json({ error: "Adventurer not found." }, { status: 404 });

  const config = await resolveImageConfig();
  if (!config) {
    return Response.json(
      {
        error:
          "No drawing service is set up, so the game cannot draw them. " +
          "You can still take a photograph of a drawing — that beats anything a machine makes.",
      },
      { status: 503 },
    );
  }

  const look = lookOf(character);
  const prompt = portraitPrompt({
    name: character.name,
    race: character.race,
    archetype: character.archetype,
    ageBand: character.ageBand,
    look: lookSentence(look),
    tone: character.partyMemberships[0]?.campaign.tone ?? "COZY",
  });

  try {
    const art = await drawScene(config, prompt);

    const bytes = new Uint8Array(new ArrayBuffer(art.data.byteLength));
    bytes.set(art.data);

    await db.characterArt.upsert({
      where: { characterId: character.id },
      create: {
        characterId: character.id,
        data: bytes,
        mimeType: art.mimeType,
        lookKey: lookKey(look),
        prompt: art.prompt,
        model: art.model,
      },
      // The version is what makes a redraw visible: the picture is served with
      // a long cache life, so without it the new one would be the old one on
      // every device that had already seen it.
      update: {
        data: bytes,
        mimeType: art.mimeType,
        lookKey: lookKey(look),
        prompt: art.prompt,
        model: art.model,
        version: { increment: 1 },
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ImagesUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    // The table gets a plain sentence. Nothing here is worth a stack trace to
    // somebody who tapped a button hoping for a picture.
    return Response.json(
      { error: "The drawing service did not answer. You can try again in a moment." },
      { status: 502 },
    );
  }
}
