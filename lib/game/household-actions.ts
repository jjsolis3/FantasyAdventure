"use server";

/**
 * Putting accounts into the right households.
 *
 * This exists because of a thing the migration deliberately could not do. Three
 * accounts that are one family look exactly like three families to a `SELECT`,
 * so when households arrived every account was given one of its own rather than
 * grouped by a guess. Somebody has to say which ones belong together, and this
 * is where they say it.
 *
 * Administrator-only, and it stays that way even once households run
 * themselves: moving an account between families moves every adventurer and
 * every adventure it owns across a privacy boundary, which is not a thing one
 * family should be able to do to another.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createHousehold, mayActForHousehold } from "@/lib/game/households";
import { mayChangePlatformRole } from "@/lib/auth/platform-admin";

export type HouseholdFormState = { error: string; done?: string } | null;

/**
 * Moves one account, and everything it owns, into another household.
 *
 * The adventurers and adventures go with it. That is the whole point — an
 * account's characters are *its* family's, and leaving them behind would put a
 * child's sheet in a household she is no longer part of, which is exactly the
 * leak all of this exists to prevent.
 *
 * Written as one transaction so there is no moment where an account is in the
 * new household and its adventurers are still in the old one.
 */
export async function moveAccountAction(
  _prev: HouseholdFormState,
  formData: FormData,
): Promise<HouseholdFormState> {
  await requirePlatformAdmin();

  const userId = String(formData.get("userId") ?? "");
  const householdId = String(formData.get("householdId") ?? "");
  if (!userId || !householdId) return { error: "Pick an account and a household." };

  const [user, household] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } }),
    db.household.findUnique({ where: { id: householdId }, select: { id: true, name: true } }),
  ]);
  if (!user) return { error: "That account no longer exists." };
  if (!household) return { error: "That household no longer exists." };

  const existing = await db.householdMember.findFirst({
    where: { userId },
    select: { id: true, householdId: true, role: true },
  });
  if (existing?.householdId === householdId) {
    return { error: `${user.displayName} is already in ${household.name}.` };
  }

  // Somebody arriving in a household that has nobody in it takes charge of it.
  //
  // Otherwise this screen can build a household nobody can use. A household
  // started here begins empty, and everyone who moves in would arrive as a
  // member — so the family made by pulling three accounts together would have
  // no OWNER at all, and once inviting and putting sheets right are gated on
  // OWNER or PARENT, nobody in that family could do either. Found by planning
  // the guards rather than by shipping them.
  const alreadyThere = await db.householdMember.count({ where: { householdId } });
  const role = alreadyThere === 0 ? "OWNER" : "MEMBER";

  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.householdMember.update({
        where: { id: existing.id },
        // Otherwise: joining an existing family arrives as a member of it. An
        // owner who moves house is not still in charge of the one they left,
        // and is not automatically in charge of the one they joined.
        data: { householdId, role },
      });
    } else {
      await tx.householdMember.create({ data: { userId, householdId, role } });
    }

    await tx.character.updateMany({ where: { userId }, data: { householdId } });
    await tx.campaign.updateMany({ where: { ownerId: userId }, data: { householdId } });
  });

  // Households nobody is left in are swept up rather than left as empty rows
  // cluttering every picker on this page. Their adventurers went with the
  // account, so there is nothing inside one to lose.
  if (existing) {
    const left = await db.householdMember.count({ where: { householdId: existing.householdId } });
    if (left === 0) {
      await db.household.delete({ where: { id: existing.householdId } }).catch(() => {});
    }
  }

  revalidatePath("/admin/households");
  return { error: "", done: `${user.displayName} is now in ${household.name}.` };
}

/**
 * Says who answers for a household and who only plays.
 *
 * The last person who can act for a household may not be demoted. A family with
 * nobody able to invite its own people or put its own sheets right is a family
 * that has to come back to whoever runs the server for everything — which is
 * the arrangement all of this exists to end.
 */
export async function setHouseholdRoleAction(
  _prev: HouseholdFormState,
  formData: FormData,
): Promise<HouseholdFormState> {
  await requirePlatformAdmin();

  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!memberId) return { error: "Pick somebody." };
  if (role !== "OWNER" && role !== "PARENT" && role !== "MEMBER") {
    return { error: "That is not a role." };
  }

  const member = await db.householdMember.findUnique({
    where: { id: memberId },
    select: { id: true, role: true, householdId: true, user: { select: { displayName: true } } },
  });
  if (!member) return { error: "That person is no longer in this household." };
  if (member.role === role) return { error: "", done: "Nothing to change." };

  if (role === "MEMBER" && mayActForHousehold(member.role)) {
    const others = await db.householdMember.count({
      where: {
        householdId: member.householdId,
        id: { not: member.id },
        role: { in: ["OWNER", "PARENT"] },
      },
    });
    if (others === 0) {
      return {
        error: `${member.user.displayName} is the only one who can answer for this household. Give somebody else that job first.`,
      };
    }
  }

  await db.householdMember.update({ where: { id: memberId }, data: { role } });
  revalidatePath("/admin/households");
  return { error: "", done: `${member.user.displayName} is now ${ROLE_WORDS[role]}.` };
}

const ROLE_WORDS: Record<string, string> = {
  OWNER: "answering for this household",
  PARENT: "able to invite and put sheets right",
  MEMBER: "playing",
};

const PLANS = ["HEARTH", "HOMESTEAD", "KEEP", "UNMETERED"] as const;
const STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"] as const;

/**
 * Puts a household on a plan, by hand.
 *
 * The lever that exists before a payment processor does, and the one that will
 * still be needed after: somebody has to be able to comp a family, put a friend
 * on unmetered, or park an account that is being argued about, without any of
 * it going through a card. When Stripe arrives its webhook writes these same
 * two columns and this stays exactly as useful.
 *
 * Plan and status are set together because they answer different questions and
 * both have to be sayable. A family whose card failed is still *on* Homestead —
 * they are `PAST_DUE` — and quietly moving them to Hearth instead would mean
 * working out what they were on again when the payment goes through.
 *
 * Deliberately not something a household can do to itself. Choosing a plan is
 * going to be a checkout page; this is the administrator's override, and an
 * override a customer can reach is not an override.
 */
export async function setPlanAction(
  _prev: HouseholdFormState,
  formData: FormData,
): Promise<HouseholdFormState> {
  await requirePlatformAdmin();

  const householdId = String(formData.get("householdId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!householdId) return { error: "Pick a household." };
  if (!PLANS.includes(plan as (typeof PLANS)[number])) return { error: "That is not a plan." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "That is not a state an account can be in." };
  }

  const household = await db.household.findUnique({
    where: { id: householdId },
    select: { name: true },
  });
  if (!household) return { error: "That household no longer exists." };

  // Upsert rather than update: households made before subscriptions existed got
  // a row from the migration and registration writes one, so this should always
  // find something — but "should always" is how a screen ends up throwing at
  // the one administrator who can fix it.
  await db.subscription.upsert({
    where: { householdId },
    update: {
      plan: plan as (typeof PLANS)[number],
      status: status as (typeof STATUSES)[number],
    },
    create: {
      householdId,
      plan: plan as (typeof PLANS)[number],
      status: status as (typeof STATUSES)[number],
    },
  });

  revalidatePath("/admin/households");
  revalidatePath("/settings");
  return { error: "", done: `${household.name} is on ${plan}, ${status.toLowerCase()}.` };
}

/**
 * Hands the installation to another account, or takes it back.
 *
 * The second place `User.role` is written, and until now there was only one:
 * `registerAction`. That meant `PLATFORM_ADMIN_EMAIL` decided who administered
 * a server at the moment an account was created and never again — change it
 * afterwards and nothing happens, because the variable is consulted at
 * registration and the role is a column. The only way to move it was a hand-
 * written `UPDATE`, which is a fine answer for the one person who wrote this
 * and no answer at all for anybody else.
 *
 * Every refusal is `mayChangePlatformRole`'s, which is a plain function for the
 * usual reason: the interesting cases are the ones that say no, and a no you
 * can only reach by signing in as two different accounts in a browser is a no
 * that stops being tested.
 */
export async function setPlatformRoleAction(
  _prev: HouseholdFormState,
  formData: FormData,
): Promise<HouseholdFormState> {
  const actor = await requirePlatformAdmin();

  const userId = String(formData.get("userId") ?? "");
  const makeAdmin = String(formData.get("makeAdmin") ?? "") === "true";
  if (!userId) return { error: "Pick somebody." };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, email: true, role: true },
  });
  if (!target) return { error: "That account no longer exists." };

  // Administrators other than the target, which is the count the rule wants —
  // "is this the last one?" rather than "how many are there?".
  const otherAdmins = await db.user.count({
    where: { role: "PLATFORM_ADMIN", id: { not: target.id } },
  });

  const verdict = mayChangePlatformRole({
    actor: { id: actor.id, platformAdmin: actor.role === "PLATFORM_ADMIN" },
    target: {
      id: target.id,
      platformAdmin: target.role === "PLATFORM_ADMIN",
      hasEmail: target.email !== null,
      displayName: target.displayName,
    },
    makeAdmin,
    otherAdmins,
  });
  if (!verdict.ok) return { error: verdict.reason };

  await db.user.update({
    where: { id: target.id },
    data: { role: makeAdmin ? "PLATFORM_ADMIN" : "PLAYER" },
  });

  revalidatePath("/admin/households");
  return {
    error: "",
    done: makeAdmin
      ? `${target.displayName} runs Hearthlight now.`
      : `${target.displayName} no longer runs Hearthlight.`,
  };
}

/** Renames a household, so "Dad's household" can become "The Solis family". */
export async function renameHouseholdAction(
  _prev: HouseholdFormState,
  formData: FormData,
): Promise<HouseholdFormState> {
  // The operator's version, which renames *other* people's families and so has
  // to take an id. A family renaming itself is `renameOwnHouseholdAction`, which
  // takes the household off the session and therefore has nothing to check.
  await requirePlatformAdmin();

  const householdId = String(formData.get("householdId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!householdId) return { error: "Pick a household." };
  if (!name) return { error: "A household needs a name." };
  if (name.length > 80) return { error: "That name is too long." };

  await db.household.update({ where: { id: householdId }, data: { name } });
  revalidatePath("/admin/households");
  return { error: "", done: `Renamed to ${name}.` };
}

/**
 * Starts a household with nobody in it yet.
 *
 * For the case this page was built for: pulling scattered accounts together
 * under a name that is nobody's in particular. Without it the only households
 * that exist are the ones the migration named after one person, and "put
 * everybody into Dad's household" is a worse answer than "make the Solis family
 * and put everybody in it".
 */
export async function createHouseholdAction(
  _prev: HouseholdFormState,
  formData: FormData,
): Promise<HouseholdFormState> {
  const admin = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A household needs a name." };
  if (name.length > 80) return { error: "That name is too long." };

  // Made with the administrator as its owner and then emptied, rather than
  // given a special "ownerless" path: `createHousehold` is the one place a
  // household comes into being, and a second way to make one is a second way to
  // make one wrong.
  const household = await createHousehold(db, { ownerId: admin.id, name });
  await db.householdMember.deleteMany({ where: { householdId: household.id, userId: admin.id } });

  revalidatePath("/admin/households");
  return { error: "", done: `${name} is ready. Move somebody into it.` };
}

/** Everything the households screen shows. */
export async function householdOverview() {
  const [households, strays] = await Promise.all([
    db.household.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        linkCode: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            user: { select: { id: true, displayName: true, email: true, username: true, role: true } },
          },
        },
        subscription: {
          select: { plan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true },
        },
        _count: { select: { characters: true, campaigns: true } },
      },
    }),
    // Should always be empty. Shown anyway, because an account outside every
    // household cannot build an adventurer and the screen that can fix it is
    // this one — a silent zero is no use to somebody wondering why.
    db.user.findMany({
      where: { households: { none: {} } },
      select: { id: true, displayName: true, email: true, username: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return { households, strays };
}

