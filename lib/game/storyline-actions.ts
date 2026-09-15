"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, isUniqueViolation } from "@/lib/db";
import { requireHouseholdParent, requirePlatformAdmin } from "@/lib/auth/session";
import { mayEditStoryline, visibleStorylineWhere } from "@/lib/game/visibility";
import { writingVerdictFor } from "@/lib/billing/usage";
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
 *
 * Since adventures learned who they belong to, this serves two screens. A
 * family writes its own at `/settings/adventures`; whoever runs the
 * installation writes the shared library at `/admin/adventures`. The form is
 * the same because the job is; what differs is whose name ends up on it, and
 * `mayEditStoryline` is the one place that decides who may touch what.
 */

/**
 * What a scope change has to say for itself.
 *
 * `FormState` carries only an error, which is right for a form that either
 * saves and navigates away or explains why it did not. This one stays where it
 * is and has something to report either way — "offered to every family now" is
 * the whole point of pressing it.
 */
export type ScopeFormState = { error: string; done?: string } | null;

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
  pressureName: z.string().trim().min(1, "What gets worse while they dither?").max(60),
  isActive: z.string().optional(),
  /**
   * Which screen this was written on, and therefore where to go afterwards.
   *
   * Two legal values checked against a list, not a path taken from a form — a
   * redirect target a request can set is an open redirect however innocent it
   * looks. It decides nothing about authority: `mayEditStoryline` does that,
   * and a family posting `admin` here still cannot touch a shipped adventure.
   */
  surface: z.enum(["admin", "household"]).catch("admin"),
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

/**
 * Writes an adventure, for whoever it belongs to.
 *
 * This was platform-admin-only, which meant a family could not write their own
 * — and, worse, that anything written was installation-wide, so two families
 * on one server shared a library neither of them chose. That is the same leak
 * households exist to close, on the one table that never got a household
 * column.
 *
 * Who may write what:
 *
 *   - **A family writes its own**, always `HOUSEHOLD` and always stamped with
 *     their own id. There is no scope control on their form and no argument
 *     here they could reach — the household comes off the session, the same
 *     rule invitations follow.
 *   - **A family may not publish to everybody.** `COMMUNITY` is promotion, and
 *     only whoever runs the installation may grant it. This is a children's
 *     app: content that reaches other people's children should have had
 *     somebody look at it, and the alternative is building moderation.
 *   - **A shipped adventure stays the installation's**, however many families
 *     read it. Editing one must not quietly take it away from the rest.
 */
export async function saveStorylineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireHouseholdParent();

  const parsed = storylineSchema.safeParse({
    id: formData.get("id") ?? undefined,
    surface: formData.get("surface") ?? undefined,
    title: formData.get("title"),
    tagline: formData.get("tagline"),
    premise: formData.get("premise"),
    hook: formData.get("hook"),
    defaultTone: formData.get("defaultTone"),
    readingLevel: formData.get("readingLevel"),
    minPlayers: formData.get("minPlayers"),
    maxPlayers: formData.get("maxPlayers"),
    estimatedScenes: formData.get("estimatedScenes"),
    pressureName: formData.get("pressureName"),
    isActive: formData.get("isActive") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { id, isActive, surface, ...fields } = parsed.data;
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

  // Whether a family is writing its own, decided by the screen rather than by
  // the actor: whoever runs the installation is also somebody's parent, and
  // which of the two jobs they are doing right now is a thing only the screen
  // knows. What they may *do* is still the rule's question, below.
  const mine = surface === "household";
  if (mine && !actor.householdId) {
    return { error: "This account is not part of a household yet. Ask an administrator." };
  }

  let storylineId = id;
  try {
    if (storylineId) {
      const existing = await db.storyline.findUnique({
        where: { id: storylineId },
        select: { scope: true, householdId: true, slug: true },
      });
      if (!existing) return { error: "That adventure could not be found." };

      if (!mayEditStoryline(actor, existing)) {
        return {
          error:
            existing.scope === "SYSTEM"
              ? "That adventure came with the game, so it belongs to whoever runs Hearthlight rather than to one family."
              : "That adventure belongs to another family.",
        };
      }

      // Scope and owner are never taken from this form. An edit changes the
      // story, not who it is for — moving one between families, or sharing it
      // with everybody, is a separate deliberate act on the administrator's
      // screen.
      await db.storyline.update({ where: { id: storylineId }, data });
    } else {
      if (!mine && !actor.everywhere) {
        return { error: "Only whoever runs Hearthlight can add to the installation's library." };
      }

      // Only on the way in. A family who wrote adventures and later moved to a
      // smaller plan keeps every one of them, keeps playing them and keeps
      // editing them — this is "may I add one more", like every other ceiling.
      if (mine) {
        const allowed = await writingVerdictFor(actor.householdId);
        if (!allowed.ok) return { error: allowed.reason };
      }

      const created = await db.storyline.create({
        data: {
          ...data,
          // A family's adventure gets a slug nothing can collide with. Two
          // families both writing "The Cat Who Came Back" would otherwise have
          // the second told the title was taken — by an adventure she cannot
          // see, which is both a confusing refusal and a small admission that
          // the other family exists.
          slug: mine ? `${slugFrom(fields.title)}-${Date.now().toString(36)}` : slugFrom(fields.title),
          scope: mine ? "HOUSEHOLD" : "SYSTEM",
          householdId: mine ? actor.householdId : null,
        },
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

  const home = surface === "household" ? "/settings/adventures" : "/admin/adventures";
  revalidatePath(home);
  revalidatePath("/campaigns/new");
  redirect(`${home}?saved=${storylineId}`);
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
  const actor = await requireHouseholdParent();

  const id = String(formData.get("storylineId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  // Ownership, not just a guard. This was `updateMany` by an id off the form
  // with nothing compared against the caller — harmless while only one person
  // could reach the screen, and one family switching off another's adventure
  // the moment a second family can.
  const storyline = await db.storyline.findUnique({
    where: { id },
    select: { scope: true, householdId: true },
  });
  if (!storyline || !mayEditStoryline(actor, storyline)) return;

  await db.storyline.update({ where: { id }, data: { isActive: active } });

  revalidatePath("/settings/adventures");
  revalidatePath("/admin/adventures");
  revalidatePath("/campaigns/new");
}

/**
 * Copies one, as a starting point for a family's own version.
 *
 * The most useful thing on the family's screen, and the reason it is worth
 * letting a household reach this at all: starting from a blank page is a
 * different and much harder job than changing the ending of one you have
 * already played. A copy of a shipped adventure is **theirs** — household
 * scope, their id — so editing it cannot take the original away from anybody
 * else, and the seed will never overwrite it.
 *
 * Scoped to what the caller can actually see, so an id off the form cannot
 * reach another family's story and take a copy of it.
 */
export async function duplicateStorylineAction(formData: FormData): Promise<void> {
  const actor = await requireHouseholdParent();

  const id = String(formData.get("storylineId") ?? "");
  const mine = String(formData.get("surface") ?? "admin") === "household";
  if (!id) return;
  if (mine && !actor.householdId) return;

  // A copy is a new adventure, so it asks the same question writing one does.
  if (mine) {
    const allowed = await writingVerdictFor(actor.householdId);
    if (!allowed.ok) return;
  }

  const source = await db.storyline.findFirst({
    where: actor.everywhere
      ? { id }
      : { id, ...visibleStorylineWhere(actor.householdId) },
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
      pressureName: source.pressureName,
      // Copies start switched off, so an unedited duplicate never appears in
      // the setup list next to the one it was copied from.
      isActive: false,
      isCustom: true,
      // A copy made on the family's screen is the family's, whatever it was
      // copied from. Made on the administrator's, it joins the installation's
      // library like the thing it came from.
      scope: mine ? "HOUSEHOLD" : "SYSTEM",
      householdId: mine ? actor.householdId : null,
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

  const home = mine ? "/settings/adventures" : "/admin/adventures";
  revalidatePath(home);
  redirect(`${home}/${copy.id}`);
}

/**
 * Who an adventure is for — the administrator's decision alone.
 *
 * A family writes its own and it is theirs. Offering it to *every* family on
 * the installation is a different act with a different blast radius, and this
 * is a children's app: a story that reaches other people's children should have
 * had somebody look at it first. So promotion to `COMMUNITY` lives here rather
 * than on a toggle beside the save button, and the alternative — letting a
 * household publish and building moderation to catch it afterwards — is a much
 * bigger thing badly disguised as a smaller one.
 *
 * It also runs the other way, which is the half that matters when something has
 * gone wrong: an adventure can be put back to the family it came from without
 * anybody losing it, and without touching a campaign already being played.
 */
export async function setStorylineScopeAction(
  _prev: ScopeFormState,
  formData: FormData,
): Promise<ScopeFormState> {
  await requirePlatformAdmin();

  const id = String(formData.get("storylineId") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const tier = String(formData.get("tier") ?? "STARTER");
  const householdId = String(formData.get("householdId") ?? "") || null;

  if (!id) return { error: "Pick an adventure." };
  if (tier !== "STARTER" && tier !== "EXTRA") return { error: "That is not a tier." };
  if (scope !== "SYSTEM" && scope !== "HOUSEHOLD" && scope !== "COMMUNITY") {
    return { error: "That is not a scope." };
  }

  const storyline = await db.storyline.findUnique({ where: { id }, select: { title: true } });
  if (!storyline) return { error: "That adventure could not be found." };

  // A household-scoped adventure with no household belongs to nobody and shows
  // up nowhere — which is the right resting place for one whose family has been
  // deleted, and a mistake if somebody chose it from a menu.
  if (scope === "HOUSEHOLD" && !householdId) {
    return { error: "Say which family it belongs to." };
  }
  if (householdId) {
    const household = await db.household.findUnique({
      where: { id: householdId },
      select: { id: true },
    });
    if (!household) return { error: "That family could not be found." };
  }

  await db.storyline.update({
    where: { id },
    data: {
      scope,
      // Which plan it comes with. A commercial decision, so it is the
      // operator's and survives every redeploy — the seed sets a tier when it
      // *makes* a row and never when it updates one.
      tier,
      // `SYSTEM` and `COMMUNITY` keep their author, so a shared adventure can
      // still be edited by the family who wrote it. Only a shipped one has
      // genuinely nobody behind it.
      householdId: scope === "SYSTEM" ? null : householdId,
    },
  });

  revalidatePath("/admin/adventures");
  revalidatePath("/settings/adventures");
  revalidatePath("/campaigns/new");

  const included = tier === "STARTER" ? "with every plan" : "with a paid plan";
  const said =
    scope === "COMMUNITY"
      ? `${storyline.title} is offered to every family now, ${included}.`
      : scope === "SYSTEM"
        ? `${storyline.title} is part of the installation's library, ${included}.`
        : `${storyline.title} belongs to one family now.`;
  return { error: "", done: said };
}
