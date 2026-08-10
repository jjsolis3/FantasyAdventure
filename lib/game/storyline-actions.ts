"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, isUniqueViolation } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";

/**
 * Writing adventures from inside the app.
 *
 * Ten ship with it, and ten is enough for a while and then abruptly is not —
 * particularly for a family who know what their own children find frightening
 * far better than a seed file does. Until now adding one meant editing
 * TypeScript and redeploying, which is a bar that means "no".
 *
 * Everything written here is marked custom, which takes it out of the seed's
 * hands for good. That flag is the whole safety mechanism: the seed runs on
 * every container start and would otherwise restore its own text over anything
 * with a matching slug.
 */

const actSchema = z.object({
  title: z.string().trim().min(1, "Every chapter needs a name.").max(120),
  goal: z.string().trim().min(1, "Say what this chapter is for.").max(1000),
  /** One per line in the form; blank lines are how people space things out. */
  beats: z.string().max(2000).optional(),
  seeks: z.string().max(1000).optional(),
});

const storylineSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Give the adventure a title.").max(120),
  tagline: z.string().trim().min(1, "One line to sell it.").max(200),
  premise: z.string().trim().min(1, "What is this adventure about?").max(2000),
  hook: z.string().trim().min(1, "How does it open?").max(2000),
  defaultTone: z.enum(["COZY", "ADVENTUROUS", "SPOOKY"]),
  readingLevel: z.enum(["EARLY_READER", "MIDDLE_GRADE", "TEEN", "FAMILY_MIXED"]),
  minPlayers: z.coerce.number().int().min(1).max(8),
  maxPlayers: z.coerce.number().int().min(1).max(8),
  estimatedScenes: z.coerce.number().int().min(3).max(60),
  isActive: z.string().optional(),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** One per line, trimmed, blanks dropped. */
function lines(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * A url-safe name for the adventure, derived from its title.
 *
 * Only ever set at creation. Changing it later would orphan nothing — campaigns
 * point at the id — but the slug is what the seed matches on, and a shipped
 * adventure that is renamed and then loses its slug would come back as a
 * duplicate on the next deployment.
 */
function slugFrom(title: string): string {
  return (
    title
      .toLocaleLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "adventure"
  );
}

function actsFrom(formData: FormData) {
  const titles = formData.getAll("actTitle").map(String);

  return titles.map((title, index) => ({
    title,
    goal: String(formData.getAll("actGoal")[index] ?? ""),
    beats: String(formData.getAll("actBeats")[index] ?? ""),
    seeks: String(formData.getAll("actSeeks")[index] ?? ""),
  }));
}

export async function saveStorylineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const parsed = storylineSchema.safeParse({
    id: formData.get("id") ?? undefined,
    title: formData.get("title"),
    tagline: formData.get("tagline"),
    premise: formData.get("premise"),
    hook: formData.get("hook"),
    defaultTone: formData.get("defaultTone"),
    readingLevel: formData.get("readingLevel"),
    minPlayers: formData.get("minPlayers"),
    maxPlayers: formData.get("maxPlayers"),
    estimatedScenes: formData.get("estimatedScenes"),
    isActive: formData.get("isActive") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { id, isActive, ...fields } = parsed.data;
  if (fields.minPlayers > fields.maxPlayers) {
    return {
      error: "The smallest party cannot be bigger than the largest.",
      fieldErrors: { minPlayers: "Must not exceed the largest party." },
    };
  }

  const rawActs = actsFrom(formData).filter((act) => act.title.trim() || act.goal.trim());
  if (rawActs.length === 0) {
    return { error: "An adventure needs at least one chapter." };
  }

  const acts: { title: string; goal: string; beats: string[]; seeks: string[] }[] = [];
  for (const [index, act] of rawActs.entries()) {
    const checked = actSchema.safeParse(act);
    if (!checked.success) {
      const first = checked.error.issues[0];
      return {
        error: `Chapter ${index + 1}: ${first?.message ?? "something is missing."}`,
        fieldErrors: { [`act.${index}.${String(first?.path[0] ?? "title")}`]: first?.message ?? "" },
      };
    }
    acts.push({
      title: checked.data.title,
      goal: checked.data.goal,
      beats: lines(checked.data.beats),
      seeks: lines(checked.data.seeks),
    });
  }

  const data = { ...fields, isActive: isActive === "on", isCustom: true };

  let storylineId = id;
  try {
    if (storylineId) {
      const updated = await db.storyline.updateMany({ where: { id: storylineId }, data });
      if (updated.count === 0) return { error: "That adventure could not be found." };
    } else {
      const created = await db.storyline.create({
        data: { ...data, slug: slugFrom(fields.title) },
        select: { id: true },
      });
      storylineId = created.id;
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "There is already an adventure with that title. Give this one a different name." };
    }
    throw error;
  }

  // Chapters are replaced rather than reconciled: they have no identity of their
  // own beyond their order, and nothing points at them except the storyline.
  await db.$transaction(async (tx) => {
    await tx.storylineAct.deleteMany({ where: { storylineId } });
    await tx.storylineAct.createMany({
      data: acts.map((act, index) => ({ ...act, index: index + 1, storylineId: storylineId! })),
    });
  });

  revalidatePath("/settings/adventures");
  revalidatePath("/campaigns/new");
  redirect(`/settings/adventures?saved=${storylineId}`);
}

/**
 * Stops an adventure being offered, without touching anybody's game.
 *
 * There is no delete. Campaigns point at their storyline for the premise and
 * the act they are in, so removing one would take the spine out of a story
 * halfway through being told — and a family who has finished it would lose
 * what their journal is about.
 */
export async function setStorylineActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("storylineId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  await db.storyline.updateMany({ where: { id }, data: { isActive: active } });

  revalidatePath("/settings/adventures");
  revalidatePath("/campaigns/new");
}

/** Copies one, as a starting point for a family's own version. */
export async function duplicateStorylineAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("storylineId") ?? "");
  if (!id) return;

  const source = await db.storyline.findUnique({
    where: { id },
    include: { acts: { orderBy: { index: "asc" } } },
  });
  if (!source) return;

  const title = `${source.title} (yours)`;
  const copy = await db.storyline.create({
    data: {
      slug: `${slugFrom(title)}-${Date.now().toString(36)}`,
      title,
      tagline: source.tagline,
      premise: source.premise,
      hook: source.hook,
      defaultTone: source.defaultTone,
      readingLevel: source.readingLevel,
      minPlayers: source.minPlayers,
      maxPlayers: source.maxPlayers,
      estimatedScenes: source.estimatedScenes,
      // Copies start switched off, so an unedited duplicate never appears in
      // the setup list next to the one it was copied from.
      isActive: false,
      isCustom: true,
      acts: {
        create: source.acts.map((act) => ({
          index: act.index,
          title: act.title,
          goal: act.goal,
          beats: [...act.beats],
          seeks: [...act.seeks],
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/settings/adventures");
  redirect(`/settings/adventures/${copy.id}`);
}
