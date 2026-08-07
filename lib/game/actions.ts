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
  canonicalPair,
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
  might: z.coerce.number().int(),
  wits: z.coerce.number().int(),
  heart: z.coerce.number().int(),
  spark: z.coerce.number().int(),
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
    might: formData.get("might"),
    wits: formData.get("wits"),
    heart: formData.get("heart"),
    spark: formData.get("spark"),
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

  const { might, wits, heart, spark, gender, description, ...rest } = parsed.data;
  const stats: StatBlock = { might, wits, heart, spark };

  // The builder prevents illegal spreads, but a form post can claim anything.
  const statCheck = validateStats(stats);
  if (!statCheck.ok) return { error: statCheck.reason };

  const skills = parseSkills(formData);

  const character = await db.character.create({
    data: {
      ...rest,
      ...stats,
      gender: gender || null,
      description: description || null,
      userId: user.id,
      skills: { create: skills.map((name) => ({ name })) },
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

  const { might, wits, heart, spark, gender, description, ...rest } = parsed.data;
  const stats: StatBlock = { might, wits, heart, spark };

  const statCheck = validateStats(stats);
  if (!statCheck.ok) return { error: statCheck.reason };

  const skills = parseSkills(formData);

  await db.$transaction(async (tx) => {
    await tx.character.update({
      where: { id },
      data: { ...rest, ...stats, gender: gender || null, description: description || null },
    });

    // Replace the skill set, but keep rank and xp for skills that survive the
    // edit — losing a skill's progress because a name was retyped would be a
    // rotten surprise mid-campaign.
    await tx.characterSkill.deleteMany({ where: { characterId: id, name: { notIn: skills } } });
    for (const name of skills) {
      await tx.characterSkill.upsert({
        where: { characterId_name: { characterId: id, name } },
        create: { characterId: id, name },
        update: {},
      });
    }
  });

  revalidatePath("/characters");
  revalidatePath(`/characters/${id}`);
  return { error: "" };
}

export async function deleteCharacterAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("characterId");
  if (typeof id !== "string") return;

  await db.character.deleteMany({ where: { id, userId: user.id } });

  revalidatePath("/characters");
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

  // Both characters must belong to the signed-in household.
  const owned = await db.character.count({ where: { id: { in: [fromId, toId] }, userId: user.id } });
  if (owned !== 2) return { error: "Character not found." };

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

  const relationship = await db.relationship.findUnique({
    where: { id },
    include: { characterA: { select: { userId: true } } },
  });
  if (!relationship || relationship.characterA.userId !== user.id) return;

  await db.relationship.delete({ where: { id } });

  revalidatePath(`/characters/${relationship.characterAId}`);
  revalidatePath(`/characters/${relationship.characterBId}`);
  revalidatePath("/characters");
}
