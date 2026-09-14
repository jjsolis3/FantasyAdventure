import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { revokeInviteAction } from "@/lib/auth/actions";
import { describeAllowance, entitlementsFor } from "@/lib/billing/plans";
import { Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AdminInviteForm, type HouseholdChoice } from "./admin-invite-form";

export const dynamic = "force-dynamic";

function statusOf(invite: { redeemedById: string | null; expiresAt: Date | null }): {
  label: string;
  className: string;
} {
  if (invite.redeemedById) {
    return { label: "Used", className: "border-hearth-700/50 bg-hearth-800/40 text-hearth-300" };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return { label: "Expired", className: "border-red-900/50 bg-red-950/30 text-red-300" };
  }
  return { label: "Ready", className: "border-moss-600/50 bg-moss-800/40 text-moss-400" };
}

/**
 * Who gets in, and to what.
 *
 * This screen is here because of a question with an obvious answer that the app
 * had got the wrong way round. A household&rsquo;s invitations page offered
 * *&ldquo;starts a household of their own&rdquo;* to one account in the
 * installation, hidden in a dropdown — so admitting a family, the single act
 * that decides how many families there are, lived on the family screen. It is
 * not a thing a family does. It is the thing the platform does, and if this
 * ever sells subscriptions it is the thing being sold.
 *
 * So it moved. `/settings/invites` now offers exactly one kind of code — join
 * this house — to everybody including whoever runs the installation, and both
 * of the codes only an administrator may write are here.
 *
 * The seat count beside each family is not decoration: it is the number the
 * invitation will be refused against, so the refusal is never a surprise.
 */
export default async function AdminInvitesPage() {
  await requirePlatformAdmin();

  const [invites, households] = await Promise.all([
    db.inviteCode.findMany({
      // Every code in the installation, which is right *here* and was wrong on
      // the family screen. Somebody has to be able to see the bootstrap code and
      // the codes a household has handed out; that somebody is whoever runs it.
      include: {
        redeemedBy: { select: { displayName: true } },
        household: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.household.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subscription: { select: { plan: true, status: true } },
        _count: { select: { members: true } },
      },
    }),
  ]);

  const choices: HouseholdChoice[] = households.map((household) => {
    const entitlements = entitlementsFor(household.subscription);
    return {
      id: household.id,
      name: household.name,
      seats: `${describeAllowance(household._count.members, entitlements.seats)} in the house`,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Administrator"
        title="Invitations"
        lead="Admitting a family, and helping one that cannot help itself."
      />

      <p className="mb-8">
        <Link href="/admin" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to administration
        </Link>
      </p>

      <div className="space-y-6">
        <Card>
          <AdminInviteForm households={choices} />
        </Card>

        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">
            Every code <span className="text-base text-hearth-400">({invites.length})</span>
          </h2>

          {invites.length === 0 ? (
            <p className="text-sm text-hearth-400">No codes yet.</p>
          ) : (
            <ul className="divide-y divide-hearth-800/50">
              {invites.map((invite) => {
                const status = statusOf(invite);
                return (
                  <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                    <code className="rounded bg-hearth-950/70 px-2 py-1 font-mono text-hearth-100">
                      {invite.code}
                    </code>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${status.className}`}>
                      {status.label}
                    </span>

                    <span className="rounded-full border border-hearth-600/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-300">
                      {invite.grant === "NEW_HOUSEHOLD"
                        ? "New family"
                        : (invite.household?.name ?? "No family")}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm text-hearth-400">
                      {invite.redeemedBy
                        ? `Used by ${invite.redeemedBy.displayName}`
                        : (invite.forName ??
                          invite.note ??
                          (invite.isBootstrap ? "Bootstrap code" : ""))}
                      {!invite.redeemedById && invite.expiresAt
                        ? ` · expires ${invite.expiresAt.toLocaleDateString()}`
                        : ""}
                    </span>

                    {!invite.redeemedById ? (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <SubmitButton variant="danger" pendingLabel="Revoking…">
                          Revoke
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
