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
  statsOf,
  validateStats,
  type RelationshipKind,
  type StatBlock,
} from "@/lib/game/rules";

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

  // The tie is declared from an adventurer you answer for…
  const from = await db.character.findFirst({ where: { id: fromId, userId: user.id } });
  if (!from) return { error: "Character not found." };

  // …to one of yours, or to somebody you are actually adventuring with. Once a
  // household hands a child their own adventurer, "Rowan is Mira's sibling" is
  // a tie between two accounts, and it has to stay declarable — but only to
  // people you share a story with, so this cannot reach across the whole app.
  const to = await db.character.findFirst({
    where: {
      id: toId,
      OR: [
        { userId: user.id },
        { partyMemberships: { some: { campaign: { party: { some: { characterId: fromId } } } } } },
      ],
    },
  });
  if (!to) return { error: "Character not found." };

  const pair = canonicalPair(fromId, toId, kind as RelationshipKind);

  await db.relationship.upsert({
    where: {
      characterAId_characterBId: {
        characterAId: pair.characterAId,
        characterBId: pair.characterBId,
      },
    },
    create: pair,
    // Re-declaring an existing relationship updates its kind but preserves the
    // bond that has already been earned between these two.
    update: { aToB: pair.aToB },
  });

  revalidatePath(`/characters/${fromId}`);
  revalidatePath(`/characters/${toId}`);
  revalidatePath("/characters");
  return { error: "" };
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
