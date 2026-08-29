"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ABOUT_MAX, NAME_MAX, WANTS_MAX } from "@/lib/game/rivals";
import type { FormState } from "@/lib/auth/actions";

/**
 * Writing down, changing and retiring the person who keeps turning up.
 *
 * One per household — the unique index says so and this respects it by
 * updating rather than creating a second. A cast of rivals dilutes the one face
 * the girls are meant to groan at.
 *
 * The scoreboard is not settable here on purpose. It is earned in play, and a
 * tally somebody could edit is a tally nobody believes.
 */

const rivalSchema = z.object({
  name: z.string().trim().min(1, "Give them a name.").max(NAME_MAX),
  about: z
    .string()
    .trim()
    .min(1, "Say what they are like, in a sentence.")
    .max(ABOUT_MAX),
  wants: z
    .string()
    .trim()
    .min(1, "Say what they are always after — it is what makes them a rival rather than a villain.")
    .max(WANTS_MAX),
});

export async function saveRivalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = rivalSchema.safeParse({
    name: formData.get("name"),
    about: formData.get("about"),
    wants: formData.get("wants"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That will not do." };
  }

  await db.rival.upsert({
    where: { ownerId: user.id },
    create: { ownerId: user.id, ...parsed.data },
    // The score and where they were last seen survive a rewrite. A family
    // sharpening the description of somebody they have raced four times has not
    // asked to start the rivalry again.
    update: parsed.data,
  });

  revalidatePath("/characters");
  return { error: "" };
}

export async function retireRivalAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  const user = await requireUser();

  // Deleted rather than flagged, and the meetings go with them. Unlike a dream
  // — which is a record of what a child wanted and worth keeping after she
  // changes her mind — a rival nobody wants any more is just a character the
  // storyteller should stop using.
  await db.rival.deleteMany({ where: { ownerId: user.id } });

  revalidatePath("/characters");
  return { error: "" };
}
