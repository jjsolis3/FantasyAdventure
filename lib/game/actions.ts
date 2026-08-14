"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";
import { ALL_SKILLS } from "@/lib/game/character-options";
import {
  RELATIONSHIP_KINDS,
  SKILLS_PER_CHARACTER,
  STATS,
  canonicalPair,
  statColumns,
  STAT_BUDGET,
  statsOf,
  validateStats,
  type RelationshipKind,
  type StatBlock,
} from "@/lib/game/rules";
import { needsConsent, reachableCharacterWhere } from "@/lib/game/ties";

const characterSchema = z.object({
  name: z.string().trim().min(1, "Every adventurer needs a name.").max(60, "That name is very long."),
  race: z.string().trim().min(1, "Pick a race, or type your own.").max(40),
  archetype: z.string().trim().min(1, "Pick a calling, or type your own.").max(40),
  gender: z.string().trim().max(40).optional(),
  pronouns: z.string().trim().min(1, "Pronouns help the storyteller describe you.").max(40),
  ageBand: z.enum(["CHILD", "TEEN", "GROWNUP", "ELDER"]),
  description: z.string().trim().max(1000, "Keep it under 1000 characters.").optional(),
  // Generated from STATS rather than listed, so a new stat cannot be added to
  // the game and silently dropped by the one form that creates characters.
  ...Object.fromEntries(STATS.map((stat) => [stat, z.coerce.number().int()])),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

function parseCharacterForm(formData: FormData) {
  return characterSchema.safeParse({
    name: formData.get("name"),
    race: formData.get("race"),
    archetype: formData.get("archetype"),
    gender: formData.get("gender") ?? undefined,
    pronouns: formData.get("pronouns"),
    ageBand: formData.get("ageBand"),
    description: formData.get("description") ?? undefined,
    ...Object.fromEntries(STATS.map((stat) => [stat, formData.get(stat)])),
  });
}

/** Skills arrive as repeated form fields; only known skills are accepted. */
function parseSkills(formData: FormData): string[] {
  const chosen = formData
    .getAll("skills")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => ALL_SKILLS.includes(value));

  return [...new Set(chosen)].slice(0, SKILLS_PER_CHARACTER);
}

export async function createCharacterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = parseCharacterForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Named rather than rest-spread, because the stats live in the same object and
  // a `...rest` here would write them twice — once raw, once through
  // `statColumns` — with the raw copy winning on a bad day.
  const { name, race, archetype, gender, pronouns, ageBand, description } = parsed.data;
  const stats: StatBlock = statsOf(parsed.data);

  // The builder prevents illegal spreads, but a form post can claim anything.
  const statCheck = validateStats(stats);
  if (!statCheck.ok) return { error: statCheck.reason };

  const skills = parseSkills(formData);

  const character = await db.character.create({
    data: {
      name,
      race,
      archetype,
      pronouns,
      ageBand,
      ...statColumns(stats),
      // Recorded at the moment she is built, so growth is always measured from
      // what she actually started with rather than from whatever the constant
      // happens to be years later. See statPointsUnspent.
      buildBudget: STAT_BUDGET,
      gender: gender || null,
      description: description || null,
      userId: user.id,
      // Stamped as chosen at level 1, because they were. Left null they would
      // read as skills she practised her way into, and the level-up entitlement
      // counts picks rather than skills — so a brand-new character would arrive
      // owing herself two extra choices she had already made in the builder.
      skills: { create: skills.map((name) => ({ name, chosenAtLevel: 1 })) },
    },
  });

  revalidatePath("/characters");
  redirect(`/characters/${character.id}`);
}

export async function updateCharacterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const id = formData.get("characterId");
  if (typeof id !== "string") return { error: "Missing character." };

  // Scoped by userId so one household cannot edit another's characters by id.
  const existing = await db.character.findFirst({ where: { id, userId: user.id } });
  if (!existing) return { error: "Character not found." };

  const parsed = parseCharacterForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Deliberately only who she is — not what she can do.
  //
  // Stats and skills both grow through play now, and this form is the builder.
  // Letting it write them back meant two editors for the same rows, one of
  // which still believed the rule was "exactly twelve points and two skills":
  // saving a typo fix would have undone every point she had spent and deleted
  // every skill she had earned. Points are raised on the sheet, one at a time,
  // and skills arrive by being practised. Nothing here can take either away.
  // Stats are deliberately absent from this list — see the note above. Named
  // rather than rest-spread so adding a stat cannot quietly make it editable
  // here: a new field has to be written down to be saved.
  const { name, race, archetype, gender, pronouns, ageBand, description } = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.character.update({
      where: { id },
      data: {
        name,
        race,
        archetype,
        pronouns,
        ageBand,
        gender: gender || null,
        description: description || null,
      },
    });

    // Skills are deliberately not touched here.
    //
    // This used to replace the whole set from the form, which was right when
    // the only skills that existed were the two picked in the builder. It is
    // badly wrong now: a skill learned in play — four goes at climbing turning
    // into Climbing — is not in the builder's list and does not survive being
    // "replaced". Opening a sheet to fix a typo in a description would have
    // quietly deleted everything she had earned, which is about the worst thing
    // a save button can do.
    //
    // So the builder builds and play grows, and the two never write to the same
    // rows. Nothing here can cost her a skill.
  });

  revalidatePath("/characters");
  revalidatePath(`/characters/${id}`);
  return { error: "" };
}

/**
 * Removes an adventurer for good.
 *
 * The one thing in this app that destroys earned progress, and the only way to
 * do it — there is no delete on the party list, in a campaign, or anywhere a
 * misplaced tap could reach. It asks for the name to be typed out, and checks
 * that here rather than only in the browser: a confirmation that lives solely
 * in the client is a suggestion, and this is the request that cannot be undone.
 *
 * A handover is the answer to almost every reason somebody arrives here, so the
 * screen says so before it asks.
 */
export async function deleteCharacterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const id = formData.get("characterId");
  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typeof id !== "string" || !id) return { error: "Which adventurer?" };

  const character = await db.character.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true },
  });
  if (!character) return { error: "Adventurer not found." };

  // Case and surrounding spaces are not the point; typing the name is.
  if (typed.toLocaleLowerCase() !== character.name.trim().toLocaleLowerCase()) {
    return {
      error: `That did not match. Type ${character.name} exactly to remove them.`,
      fieldErrors: { confirmName: "This has to match their name." },
    };
  }

  await db.character.delete({ where: { id: character.id } });

  revalidatePath("/characters");
  revalidatePath("/campaigns");
  redirect("/characters");
}

const relationshipSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: z.enum(RELATIONSHIP_KINDS),
});

export async function setRelationshipAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = relationshipSchema.safeParse({
    fromId: formData.get("fromId"),
    toId: formData.get("toId"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return { error: "Pick a family member and how you are related." };

  const { fromId, toId, kind } = parsed.data;
  if (fromId === toId) return { error: "A character cannot be related to themselves." };

  // The tie is always declared FROM an adventurer you answer for. This is the
  // invariant that stops anybody arranging other people's families: whoever you
  // can reach, one end of the row is always yours.
  const from = await db.character.findFirst({ where: { id: fromId, userId: user.id } });
  if (!from) return { error: "Character not found." };

  // …to anybody at your table — see `reachableCharacterWhere`. Scoped to the
  // table rather than to `from`, because a newly made adventurer has been
  // nowhere yet, and that is exactly when a family wants to say who he is.
  const to = await db.character.findFirst({
    where: { id: toId, ...reachableCharacterWhere(user.id) },
    select: { id: true, userId: true },
  });
  if (!to) return { error: "That adventurer is not at your table." };

  const pair = canonicalPair(fromId, toId, kind as RelationshipKind);
  // Yours to say on your own, or a claim about somebody else's adventurer that
  // they get to answer. Confirmed on the spot in the first case: asking a
  // household to agree with itself is ceremony for nobody.
  const confirmedAt = needsConsent(user.id, to.userId) ? null : new Date();

  await db.relationship.upsert({
    where: {
      characterAId_characterBId: {
        characterAId: pair.characterAId,
        characterBId: pair.characterBId,
      },
    },
    create: { ...pair, proposedById: user.id, confirmedAt },
    // Re-declaring an existing relationship updates its kind but preserves the
    // bond that has already been earned between these two — and does NOT
    // re-open a tie the other household has already agreed to. Changing
    // "sibling" to "cousin" between two people who have already said yes is a
    // correction, not a new claim.
    update: { aToB: pair.aToB },
  });

  revalidatePath(`/characters/${fromId}`);
  revalidatePath(`/characters/${toId}`);
  revalidatePath("/characters");
  return { error: "" };
}

/**
 * The other household says yes.
 *
 * Either side may confirm, which sounds loose and is not: a tie you proposed is
 * already confirmed if it needed nothing, and if it is waiting then the only
 * accounts that can reach this row are the two it is about. What matters is
 * that nobody outside those two can, and that is what the ownership check does.
 */
export async function confirmRelationshipAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("relationshipId");
  if (typeof id !== "string") return;

  const relationship = await db.relationship.findUnique({
    where: { id },
    include: {
      characterA: { select: { userId: true } },
      characterB: { select: { userId: true } },
    },
  });
  if (!relationship || relationship.confirmedAt) return;

  const sides = [relationship.characterA.userId, relationship.characterB.userId];
  if (!sides.includes(user.id)) return;
  // The household that asked cannot answer for the one being asked. Without
  // this, proposing and confirming would be two clicks by the same person.
  if (relationship.proposedById === user.id) return;

  await db.relationship.update({ where: { id }, data: { confirmedAt: new Date() } });

  revalidatePath(`/characters/${relationship.characterAId}`);
  revalidatePath(`/characters/${relationship.characterBId}`);
  revalidatePath("/characters");
}

export async function removeRelationshipAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("relationshipId");
  if (typeof id !== "string") return;

  // Either side may undo it. A tie now spans two households as often as not,
  // and "only the account that happened to be stored first may remove it" is a
  // rule nobody could discover, let alone predict.
  const relationship = await db.relationship.findUnique({
    where: { id },
    include: {
      characterA: { select: { userId: true } },
      characterB: { select: { userId: true } },
    },
  });
  if (!relationship) return;
  if (relationship.characterA.userId !== user.id && relationship.characterB.userId !== user.id) {
    return;
  }

  await db.relationship.delete({ where: { id } });

  revalidatePath(`/characters/${relationship.characterAId}`);
  revalidatePath(`/characters/${relationship.characterBId}`);
  revalidatePath("/characters");
}
