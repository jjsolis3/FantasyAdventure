/**
 * Everything a family has written, in one file.
 *
 * Two reasons, and the second is the one that made it urgent. Taking money for
 * something a family's children pour their evenings into means being able to
 * hand it back — and once there is a paid service for under-13s, "give us a
 * copy" and "delete us" stop being courtesies and start being obligations.
 *
 * The first reason is nicer: the chronicle and the journal make this a keepsake
 * rather than a compliance chore. A family who stops paying, or moves to another
 * copy of Hearthlight, or just wants the year their daughters played written
 * down somewhere that is not a database, gets the whole of it.
 *
 * **Everything, by default.** Each query uses `include` rather than a hand-
 * written list of columns, so a field added next year is in the export the day
 * it exists. A list would be correct on the day it was written and quietly
 * incomplete for ever afterwards — and the failure is invisible, because an
 * export that is missing something still downloads fine.
 *
 * The exceptions are named below and they are all secrets: nothing that could
 * be used to sign in as somebody comes out of here.
 */

import { db } from "@/lib/db";

/** Bumped when the shape changes, so a file can be read back years later. */
export const ARCHIVE_VERSION = 1;

/**
 * What is deliberately left out.
 *
 * Not a privacy decision — a family exporting their own data already knows
 * their own names — but a safety one. An export is a file that gets emailed to
 * a new laptop, left in a downloads folder and copied onto a memory stick, and
 * anything in it that grants access is a key travelling by post.
 *
 *   - `passwordHash`, and the scrypt parameters with it.
 *   - Session tokens, so an old export cannot sign anybody in.
 *   - Password-reset tokens, for the same reason and more so.
 *   - The processor's customer and subscription ids: they identify an account
 *     somebody else holds, and knowing them is the first half of impersonating
 *     the family to support.
 *
 * Portraits and chapter art are left out too, for a duller reason: they are
 * base64 blobs that would turn a readable file into tens of megabytes. They are
 * downloadable one at a time from the adventurer's own page, and said so below.
 */
const WITHHELD = [
  "password hashes",
  "sign-in sessions",
  "password reset links",
  "payment processor ids",
  "pictures (they are downloadable from each adventurer's page)",
];

export type HouseholdArchive = Awaited<ReturnType<typeof householdExport>>;

/**
 * Builds the whole archive for one household.
 *
 * Assembled in memory rather than streamed. A family's entire history is a few
 * megabytes of text — a long campaign's narration is the bulk of it — and
 * streaming JSON correctly is a great deal of machinery for a file somebody
 * downloads twice in the life of an account.
 */
export async function householdExport(householdId: string) {
  const household = await db.household.findUnique({
    where: { id: householdId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      linkCode: true,
      subscription: {
        // The plan and where it stands, which is a fact about this family.
        // *Not* the processor's ids — see `WITHHELD`.
        select: {
          plan: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          consentedAt: true,
          consentMethod: true,
        },
      },
    },
  });
  if (!household) return null;

  const [people, adventurers, adventures, adventuresWritten, links] = await Promise.all([
    db.householdMember.findMany({
      where: { householdId },
      select: {
        role: true,
        createdAt: true,
        user: {
          // Named explicitly, unlike everywhere else here, because this is the
          // one table that holds a credential. An `include` would carry the
          // password hash out of the building the day somebody added a field.
          select: {
            id: true,
            displayName: true,
            email: true,
            username: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),

    db.character.findMany({
      where: { householdId },
      include: {
        skills: true,
        knacks: true,
        inventory: true,
        keepsakes: true,
        practices: true,
        acquaintances: true,
        road: { orderBy: { createdAt: "asc" } },
        dreams: true,
        companion: true,
        personalQuests: { include: { objectives: true } },
        relationshipsA: true,
        relationshipsB: true,
        // Which adventures she has been in, without dragging each whole
        // adventure along behind every adventurer who travelled in it.
        partyMemberships: { select: { campaignId: true, position: true } },
      },
      orderBy: { createdAt: "asc" },
    }),

    db.campaign.findMany({
      where: { householdId },
      include: {
        storyline: { select: { id: true, slug: true, title: true, premise: true } },
        party: { select: { characterId: true, position: true } },
        scenes: {
          orderBy: { index: "asc" },
          include: {
            // The story itself. Everything the table said and everything the
            // storyteller said back, in order — this is the part that is worth
            // keeping and the reason the file is worth having.
            turns: { orderBy: { ordinal: "asc" } },
          },
        },
        quests: { include: { objectives: true } },
        keepsakes: true,
        road: true,
        memories: true,
        encounters: true,
        forks: true,
        rivalMeetings: true,
        dreamEchoes: true,
      },
      orderBy: { createdAt: "asc" },
    }),

    db.storyline.findMany({
      where: { householdId },
      include: { acts: { orderBy: { index: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),

    db.householdLink.findMany({
      where: { OR: [{ householdAId: householdId }, { householdBId: householdId }] },
      select: { householdAId: true, householdBId: true, createdAt: true },
    }),
  ]);

  return {
    format: "hearthlight-household-archive",
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    withheld: WITHHELD,
    household: {
      name: household.name,
      createdAt: household.createdAt,
      linkCode: household.linkCode,
      subscription: household.subscription,
    },
    people,
    adventurers,
    adventures,
    /** Adventures this family wrote, as opposed to ones it played. */
    adventuresWritten,
    /** Only that a link exists, not anything about the family on the other end. */
    links: links.length,
  };
}

/** What to call the file. Dated, because a family will have more than one. */
export function archiveFilename(householdName: string): string {
  const stem =
    householdName
      .toLocaleLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "household";

  return `hearthlight-${stem}-${new Date().toISOString().slice(0, 10)}.json`;
}
