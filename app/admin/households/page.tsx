import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { signInKind, signInName } from "@/lib/auth/handle";
import { householdOverview } from "@/lib/game/household-actions";
import { UNLIMITED, describeAllowance, entitlementsFor } from "@/lib/billing/plans";
import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";
import { Card, PageTitle } from "@/components/ui";
import {
  HouseholdPlan,
  MemberRole,
  MoveAccount,
  NewHousehold,
  PlatformRole,
  RenameHousehold,
} from "./household-forms";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "answers for it",
  PARENT: "may invite and put right",
  MEMBER: "plays",
};

/**
 * What the plan above actually allows, in the numbers the caps compare against.
 *
 * Written out rather than left in a module nobody reading this screen has open,
 * because the question an administrator arrives with is "why was that refused?"
 * and the answer is one of these five numbers.
 */
function allowanceLine(household: {
  subscription: { plan: string; status: string } | null;
  members: unknown[];
  _count: { characters: number; campaigns: number };
}): string {
  const entitlements = entitlementsFor(
    household.subscription as { plan: Plan; status: SubscriptionStatus } | null,
  );

  const parts = [
    `${describeAllowance(household.members.length, entitlements.seats)} in the house`,
    `${describeAllowance(household._count.campaigns, entitlements.campaigns)} adventures`,
    entitlements.turnsPerMonth >= UNLIMITED
      ? "turns uncounted"
      : `${entitlements.turnsPerMonth} turns a month`,
    entitlements.pictures ? "pictures" : "no pictures",
  ];

  if (!entitlements.mayStart) parts.push("cannot start anything new");
  if (!entitlements.mayPlay) parts.push("cannot play");

  return parts.join(" · ");
}

/**
 * Who is in which family.
 *
 * This page exists because of something the migration deliberately refused to
 * do. Three accounts that are one family look exactly like three families from
 * the inside of a database, so when households arrived everybody got one of
 * their own rather than being grouped by a guess. This is where a person says
 * which ones belong together — and afterwards, where a child who grows up and
 * wants their own household gets moved out again.
 */
export default async function HouseholdsPage() {
  const actor = await requirePlatformAdmin();
  const { households, strays } = await householdOverview();

  const choices = households.map((household) => ({ id: household.id, name: household.name }));
  const accounts = households.flatMap((household) =>
    household.members.map((member) => ({
      id: member.user.id,
      displayName: member.user.displayName,
      signIn: signInName(member.user),
    })),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Administrator"
        title="Households"
        lead="Which accounts are one family. Everything private in this app is scoped to these."
      />

      <p className="mb-8">
        <Link href="/admin" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to administration
        </Link>
      </p>

      {strays.length > 0 ? (
        <Card className="mb-6 border-amber-800/50 bg-amber-950/20">
          <h2 className="font-display text-lg text-amber-200">
            {strays.length === 1 ? "An account" : `${strays.length} accounts`} with no household
          </h2>
          <p className="mt-2 text-sm text-amber-100/80">
            This should not happen — registering makes a household in the same breath as the
            account. Until one of these is moved into a household it cannot build an adventurer at
            all, so it is worth doing now rather than hearing about it later.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-amber-100">
            {strays.map((stray) => (
              <li key={stray.id}>
                · {stray.displayName} — {signInName(stray)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="font-display text-lg text-hearth-100">Move somebody</h2>
        <div className="mt-3">
          <MoveAccount
            accounts={[
              ...accounts,
              ...strays.map((stray) => ({
                id: stray.id,
                displayName: stray.displayName,
                signIn: signInName(stray),
              })),
            ]}
            households={choices}
          />
        </div>
      </Card>

      <Card className="mb-8">
        <h2 className="font-display text-lg text-hearth-100">Start a household</h2>
        <p className="mt-2 text-sm text-hearth-200/70">
          For pulling scattered accounts together under a name that is nobody&rsquo;s in
          particular — the family&rsquo;s, rather than whoever happened to register first.
        </p>
        <div className="mt-3">
          <NewHousehold />
        </div>
      </Card>

      <div className="space-y-4">
        {households.map((household) => (
          <Card key={household.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-hearth-100">{household.name}</h2>
              <span className="text-sm text-hearth-400 tabular-nums">
                {household._count.characters}{" "}
                {household._count.characters === 1 ? "adventurer" : "adventurers"} ·{" "}
                {household._count.campaigns}{" "}
                {household._count.campaigns === 1 ? "adventure" : "adventures"}
              </span>
            </div>

            {household.members.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-hearth-200/80">
                {household.members.map((member) => (
                  <li key={member.user.id}>
                    · <span className="text-hearth-100">{member.user.displayName}</span>{" "}
                    <span className="text-hearth-400">{signInName(member.user)}</span>
                    {/* Said out loud, because a username may be anything now —
                        including text that reads exactly like somebody's email
                        address. The software is never confused (two columns,
                        two sign-in pages); a person reading this list could be. */}
                    {signInKind(member.user) === "username" ? (
                      <span className="text-hearth-500"> (username)</span>
                    ) : null} —{" "}
                    {ROLE_LABELS[member.role] ?? member.role}
                    {member.user.role === "PLATFORM_ADMIN" ? (
                      <span className="text-moss-400"> · administers this installation</span>
                    ) : null}
                    <MemberRole
                      memberId={member.id}
                      name={member.user.displayName}
                      role={member.role}
                    />
                    {/* Not on your own row. The hand-over is done by whoever is
                        receiving it — see `mayChangePlatformRole`, which refuses
                        it server-side whether or not this renders. */}
                    {member.user.id === actor.id ? null : (
                      <PlatformRole
                        userId={member.user.id}
                        name={member.user.displayName}
                        isAdmin={member.user.role === "PLATFORM_ADMIN"}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-hearth-300">
                Nobody in it yet. Move somebody in above.
              </p>
            )}

            {/* The code that would let another family adventure with this one.
                It does nothing yet — nothing reads it until links are built —
                and it is shown because it is a fact about the household, and a
                screen that hides half of what it knows is a screen somebody
                stops trusting. */}
            <p className="mt-3 font-mono text-xs text-hearth-400">{household.linkCode}</p>

            <RenameHousehold householdId={household.id} name={household.name} />

            {/* What this family is allowed, and the only way to change it until
                there is a checkout page. The numbers beside it are the ceilings
                the caps actually compare against, so an administrator can see
                why an invitation or an adventure was refused without reading
                `lib/billing/plans.ts`. */}
            <div className="mt-4 border-t border-hearth-800/50 pt-3">
              <HouseholdPlan
                householdId={household.id}
                name={household.name}
                plan={household.subscription?.plan ?? "UNMETERED"}
                status={household.subscription?.status ?? "ACTIVE"}
              />
              <p className="mt-2 text-xs text-hearth-500">
                {allowanceLine(household)}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
