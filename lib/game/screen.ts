/**
 * The television in the living room.
 *
 * Everything a screen is allowed to do lives in this file, on purpose. A screen
 * holds a credential that no person typed and no person can revoke by changing
 * a password — it sits in a browser on a device that stays switched on — so the
 * limits on it should be readable in one place rather than inferred from six
 * route handlers.
 *
 * There are three of them, and they are the whole security model:
 *
 *   1. A screen can only ever read. There is no write path that accepts a
 *      screen token, and there should never be one.
 *   2. A screen reads exactly one adventure — the one it was adopted into.
 *      `campaignId` is set once by an account that could already see it.
 *   3. A screen sees less than a player does. Personal aims are the girls'
 *      own, and a television in a room full of people is the precise opposite
 *      of private.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { generateScreenCode } from "@/lib/auth/invite-code";
import { scenePicture } from "@/lib/game/scene-picture";
import { pressureAt, pressureLimit } from "@/lib/game/pressure";
import { ENCOUNTER_REACH } from "@/lib/game/encounters";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * MINUTE_MS;

/**
 * How long a code stays typeable.
 *
 * Short because the phone is in the same room as the television — this is a
 * ten-second errand, not an invitation to be sent somewhere. A code that
 * outlives the moment is only a way for the wrong adventure to arrive here.
 */
export const CODE_LIFETIME_MS = 15 * MINUTE_MS;

/** A television silent this long has been unplugged, moved on, or sold. */
export const IDLE_LIFETIME_MS = 14 * DAY_MS;

/** Bound on how much of the story the screen carries. Enough to read across a
 *  room; not the transcript, which is what the journal is for. */
const RECENT_TURNS = 8;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Makes what somebody typed comparable with what was issued.
 *
 * The dash is decoration — it exists so six characters can be read across a
 * room in two glances rather than one long squint — so typing it is optional.
 * Everything else is the usual kindnesses: case, stray spaces, and the space a
 * phone keyboard likes to add after an autocapitalised run.
 */
export function normaliseScreenCode(input: string): string {
  const bare = input.trim().toUpperCase().replace(/[\s-]/g, "");
  return bare.length === 6 ? `${bare.slice(0, 3)}-${bare.slice(3)}` : bare;
}

export type Registration = { screenId: string; code: string; token: string };

/**
 * A television announces itself.
 *
 * Deliberately unauthenticated — that is the entire point of the design, and
 * so it is also the only part worth being careful about. What it hands out is
 * a row that can see nothing: no campaign, no account, no reach. It becomes
 * useful only when somebody who is signed in adopts it, which means the honest
 * summary of an abusive caller is that they can fill a table with rows that
 * point at nothing. `sweepStaleScreens` clears those out.
 */
export async function registerScreen(): Promise<Registration> {
  // Registering is rare — once per television, per reload — and the sweep is a
  // single indexed delete, so this is the natural place to hang it rather than
  // adding a scheduled job to a self-hosted app a family runs on one box.
  await sweepStaleScreens().catch(() => {
    // Housekeeping. A television waiting to be adopted should not be told the
    // application is broken because a fortnight-old row would not delete.
  });

  const token = randomBytes(32).toString("base64url");

  // Retried rather than assumed: the codes are short enough to read across a
  // room, which is the same as saying they are short enough to collide.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateScreenCode();
    const existing = await db.screenPairing.findUnique({ where: { code }, select: { id: true } });
    if (existing) continue;

    const screen = await db.screenPairing.create({
      data: {
        code,
        codeExpiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
        tokenHash: hashToken(token),
      },
      select: { id: true },
    });
    return { screenId: screen.id, code, token };
  }

  throw new Error("Could not allocate a screen code.");
}

/**
 * Somebody adopts the television.
 *
 * The caller has already been checked as the owner of this adventure — see the
 * route. What is checked here is the code itself: that it exists, that it has
 * not expired, and that nobody has claimed it already.
 *
 * Claiming clears the code. It has done its job, and a doorbell that keeps
 * working after the door is open is just a way in.
 */
export async function pairScreen(
  campaignId: string,
  rawCode: string,
  label?: string | null,
): Promise<{ ok: true; screenId: string } | { ok: false; reason: string }> {
  const normalised = normaliseScreenCode(rawCode);

  const screen = await db.screenPairing.findUnique({
    where: { code: normalised },
    select: { id: true, codeExpiresAt: true },
  });

  // One message for "wrong" and "expired" would be tidier, but a family
  // retyping a code that has simply gone stale deserves to be told which of the
  // two mistakes they made — the fixes are completely different.
  if (!screen) {
    return { ok: false, reason: "No screen is waiting on that code. Check the television." };
  }
  if (screen.codeExpiresAt && screen.codeExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "That code has expired. Reload the television for a new one." };
  }

  await db.screenPairing.update({
    where: { id: screen.id },
    data: {
      campaignId,
      claimedAt: new Date(),
      label: label?.trim() || null,
      code: null,
      codeExpiresAt: null,
    },
  });

  return { ok: true, screenId: screen.id };
}

/** Takes the adventure back off a television. */
export async function unpairScreen(campaignId: string, screenId: string): Promise<boolean> {
  const { count } = await db.screenPairing.deleteMany({ where: { id: screenId, campaignId } });
  return count > 0;
}

/** The televisions currently showing this adventure. */
export async function screensFor(campaignId: string) {
  return db.screenPairing.findMany({
    where: { campaignId },
    // Just what the phone renders — see the note on `Screen` in
    // `components/campaign/send-to-screen.tsx`.
    select: { id: true, label: true },
    orderBy: { claimedAt: "asc" },
  });
}

/**
 * Resolves the token a television is holding.
 *
 * Constant-time, matching how account sessions are checked. The comparison is
 * over hex digests of fixed length, so a mismatched length means a malformed
 * token rather than a near miss, and can be rejected outright.
 */
export async function screenFromToken(token: string | null | undefined) {
  if (!token) return null;

  const expected = hashToken(token);
  const screen = await db.screenPairing.findUnique({
    where: { tokenHash: expected },
    select: { id: true, campaignId: true, tokenHash: true, label: true },
  });
  if (!screen) return null;

  const a = Buffer.from(screen.tokenHash, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Bumped on every poll, which is what keeps a television that is in use from
  // being swept up as abandoned.
  await db.screenPairing.update({
    where: { id: screen.id },
    data: { lastSeenAt: new Date() },
  });

  return { id: screen.id, campaignId: screen.campaignId, label: screen.label };
}

/**
 * Reads the token a television is holding, from the request it just made.
 *
 * Carried in a header rather than a cookie, deliberately, and the reason is the
 * first rule at the top of this file. A cookie would ride along on every
 * request the television's browser ever makes — including any that write —
 * which would make "a screen token cannot reach a write path" a thing to be
 * checked by review. A header only appears where it is put, so the rule holds
 * by construction: no write handler reads this function.
 */
export function screenTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** The television behind this request, if it is holding a token that resolves. */
export async function screenFromRequest(request: Request) {
  return screenFromToken(screenTokenFrom(request));
}

/** Removes televisions nobody has switched on in a fortnight. */
export async function sweepStaleScreens(): Promise<number> {
  const { count } = await db.screenPairing.deleteMany({
    where: { lastSeenAt: { lt: new Date(Date.now() - IDLE_LIFETIME_MS) } },
  });
  return count;
}

export type ScreenView = {
  campaignTitle: string;
  storyline: string;
  tone: string;
  status: string;
  actIndex: number;
  /**
   * The act's clock, for the whole table at once.
   *
   * Belongs on the television more than anywhere: the girls are looking at it
   * while they argue about what to do, which is the moment the clock is
   * supposed to be part of the argument. `level` is 0 until it starts moving,
   * and the component draws nothing at 0.
   */
  pressure: { name: string; level: number; limit: number };
  /**
   * Whose dice the table is waiting on, when the family rolls its own.
   *
   * The single best reason for this feature to reach the television: instead of
   * four people looking down at four phones, the room looks up and sees whose
   * turn it is to throw. Empty on every other turn.
   */
  awaitingRolls: { characterName: string; intent: string }[];
  /**
   * What is standing in front of them, if anything.
   *
   * Belongs on the television more than most things do: an encounter is the one
   * part of this game where everybody is looking at the same problem at the same
   * time, and what it *wants* is the clue they are all trying to read.
   */
  encounter: {
    name: string;
    want: string;
    ground: number;
    reach: number;
    soloName: string | null;
  } | null;
  scene: {
    title: string;
    location: string | null;
    /** Most recent first is how it is fetched; reversed before it goes out. */
    narration: { id: string; text: string }[];
    hasImage: boolean;
    imageSceneId: string | null;
    /** Set when the family drew this chapter themselves. Preferred over the generated one. */
    drawnPictureId: string | null;
    drawnVersion: number | null;
  } | null;
  party: {
    characterId: string;
    name: string;
    archetype: string;
    level: number;
    portraitVersion: number | null;
    /** Whether this adventurer still owes the round an answer. */
    waitingOn: boolean;
  }[];
  /**
   * Faces of people the family drew who are in this scene.
   *
   * Matched by name against the narration, which is rough and right: an exact
   * approach would need the storyteller to tag who is present, and it does not.
   * A false positive shows a friendly face a beat early; a false negative shows
   * nothing, which is where the game was yesterday. Neither is worth a schema.
   */
  faces: { pictureId: string; label: string; version: number }[];
  quests: { id: string; title: string; status: string }[];
  /** Changes whenever anything above would look different. */
  version: string;
};

/**
 * Everything a paired television may show.
 *
 * The shape of this function is the security boundary, so it is written as a
 * whitelist: fields are named one at a time and nothing is spread. A `select`
 * that grows by accident is how a personal aim ends up on a wall.
 *
 * Two omissions are deliberate rather than incidental:
 *
 *   - **Personal aims.** Filtered by `secretForCharacterId: null`. Each girl's
 *     own aim is meant to be hers until she chooses to say it, and a television
 *     is the least private surface in the house.
 *   - **The join code.** It is on the phone that owns the adventure already,
 *     and a code left glowing on a wall is a code that leaves the house with
 *     the first visitor who photographs it.
 */
export async function screenView(campaignId: string): Promise<ScreenView | null> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      title: true,
      tone: true,
      status: true,
      currentActIndex: true,
      turnCounter: true,
      pacing: true,
      pressure: true,
      pendingRoll: { select: { awaited: true } },
      encounters: {
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { name: true, want: true, ground: true, soloCharacterId: true },
      },
      storyline: { select: { title: true, slug: true, pressureName: true } },
      party: {
        select: {
          characterId: true,
          character: {
            select: {
              name: true,
              archetype: true,
              level: true,
              portrait: { select: { version: true } },
            },
          },
        },
      },
    },
  });
  if (!campaign) return null;

  const scene = await db.scene.findFirst({
    where: { campaignId, status: "OPEN" },
    orderBy: { index: "desc" },
    select: {
      id: true,
      title: true,
      location: true,
      actIndex: true,
      image: { select: { id: true } },
      turns: {
        where: { type: "NARRATION" },
        orderBy: { createdAt: "desc" },
        take: RECENT_TURNS,
        select: { id: true, content: true },
      },
    },
  });

  // Shared quests only — see the note above about what a television is for.
  // A picture the family drew beats one a machine made, everywhere. It is the
  // whole reason the gallery exists — a felt-tip beekeeper on the television is
  // a memento, and a generated one is only content.
  const pictures = await db.campaignImage.findMany({
    where: { campaignId },
    select: { id: true, kind: true, key: true, label: true, version: true },
  });

  const drawnScene = scene
    ? pictures.find((picture) => picture.kind === "SCENE" && picture.key === scene.id)
    : undefined;

  // Whether *any* rung of the ladder answered, so the television knows to ask
  // for bytes at all. The route works out which one; this only has to know
  // there is something to fetch.
  const anyPicture = scene
    ? (
        await scenePicture({
          campaignId,
          sceneId: scene.id,
          actIndex: scene.actIndex,
          storylineSlug: campaign.storyline.slug,
        })
      ).source !== "NONE"
    : false;

  const narrationText = (scene?.turns ?? []).map((turn) => turn.content).join(" ").toLocaleLowerCase();
  const faces = pictures
    .filter((picture) => picture.kind === "PERSON" && narrationText.includes(picture.key))
    // Three at most. A row of faces along the bottom of a television is a nice
    // thing; nine of them is a contact sheet.
    .slice(0, 3)
    .map((picture) => ({ pictureId: picture.id, label: picture.label, version: picture.version }));

  const quests = await db.quest.findMany({
    where: { campaignId, secretForCharacterId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, status: true },
  });

  const round = await db.turnRound.findFirst({
    where: { campaignId, status: "COLLECTING" },
    select: { answers: { select: { characterId: true } } },
  });
  const answered = new Set(round?.answers.map((answer) => answer.characterId) ?? []);

  const party = campaign.party.map((member) => ({
    characterId: member.characterId,
    name: member.character.name,
    archetype: member.character.archetype,
    level: member.character.level,
    portraitVersion: member.character.portrait?.version ?? null,
    waitingOn: round !== null && !answered.has(member.characterId),
  }));

  return {
    campaignTitle: campaign.title,
    storyline: campaign.storyline.title,
    tone: campaign.tone,
    status: campaign.status,
    actIndex: campaign.currentActIndex,
    pressure: {
      name: campaign.storyline.pressureName,
      ...pressureAt(campaign.pressure, pressureLimit(campaign.pacing)),
    },
    encounter: campaign.encounters[0]
      ? {
          name: campaign.encounters[0].name,
          want: campaign.encounters[0].want,
          ground: campaign.encounters[0].ground,
          reach: ENCOUNTER_REACH,
          soloName:
            campaign.party.find(
              (member) => member.characterId === campaign.encounters[0].soloCharacterId,
            )?.character.name ?? null,
        }
      : null,
    awaitingRolls: (
      (campaign.pendingRoll?.awaited as unknown as
        | { characterName: string; intent: string }[]
        | undefined) ?? []
    ).map((roll) => ({ characterName: roll.characterName, intent: roll.intent })),
    scene: scene
      ? {
          title: scene.title,
          location: scene.location,
          narration: scene.turns
            .slice()
            .reverse()
            .map((turn) => ({ id: turn.id, text: turn.content })),
          hasImage: anyPicture,
          imageSceneId: scene.image ? scene.id : null,
          drawnPictureId: drawnScene?.id ?? null,
          drawnVersion: drawnScene?.version ?? null,
        }
      : null,
    party,
    faces,
    quests,
    // Same trick the play page's poll uses: one string that changes whenever
    // the display would look different, so the television refetches on change
    // rather than repainting on a timer.
    version: [
      campaign.status,
      campaign.turnCounter,
      campaign.currentActIndex,
      scene?.id ?? "-",
      scene?.turns[0]?.id ?? "-",
      scene?.image ? "img" : "-",
      drawnScene ? `${drawnScene.id}:${drawnScene.version}` : "-",
      faces.map((face) => `${face.pictureId}:${face.version}`).join(","),
      quests.map((quest) => `${quest.id}${quest.status}`).join(","),
      party.filter((member) => member.waitingOn).length,
    ].join(":"),
  };
}
