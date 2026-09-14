import Link from "next/link";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { revokeInviteAction } from "@/lib/auth/actions";
import { householdUsage } from "@/lib/billing/usage";
import { describeAllowance } from "@/lib/billing/plans";
import { Card, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

function statusOf(invite: {
  redeemedById: string | null;
  expiresAt: Date | null;
}): { label: string; className: string } {
  if (invite.redeemedById) {
    return { label: "Used", className: "border-hearth-700/50 bg-hearth-800/40 text-hearth-300" };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return { label: "Expired", className: "border-red-900/50 bg-red-950/30 text-red-300" };
  }
  return { label: "Ready", className: "border-moss-600/50 bg-moss-800/40 text-moss-400" };
}

export default async function InvitesPage() {
  const actor = await requireHouseholdParent();

  // This household's codes, and *only* this household's, for whoever is looking.
  //
  // It used to widen to everything for a platform administrator, which put the
  // bootstrap code and every other family's invitations on the screen a parent
  // uses to invite their own child. Running the installation is a different job
  // from being a parent, and it now has a different screen: `/admin/invites`.
  //
  // The empty guard matters. An administrator who belongs to no household would
  // otherwise match `householdId: null`, which is exactly the set of codes that
  // admit new families — the one thing this screen must never hand out.
  const invites = actor.householdId
    ? await db.inviteCode.findMany({
        where: { householdId: actor.householdId },
        include: { redeemedBy: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const usage = actor.householdId ? await householdUsage(actor.householdId) : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your household"
        title="Invite codes"
        lead="Hearthlight is invite-only. Create a code for each person you want in your family."
      />

      <p className="mb-8">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      <div className="space-y-6">
        <Card>
          <InviteForm />

          {usage ? (
            <p className="mt-5 border-t border-hearth-800/50 pt-4 text-sm text-hearth-400">
              {describeAllowance(usage.seatsTaken, usage.entitlements.seats)} places in this family
              are spoken for
              {usage.outstandingInvites > 0
                ? `, counting ${usage.outstandingInvites} ${
                    usage.outstandingInvites === 1 ? "code" : "codes"
                  } handed out and not yet used`
                : ""}
              . A family invites people to play alongside it — starting a family of their own is
              something only whoever runs Hearthlight can hand out.
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">
            All codes <span className="text-base text-hearth-400">({invites.length})</span>
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

                    {/* What the code does, which used to be nowhere on this
                        screen because every code did the same thing. */}
                    {invite.grant === "NEW_HOUSEHOLD" ? (
                      <span className="rounded-full border border-hearth-600/50 bg-hearth-800/40 px-2.5 py-0.5 text-xs text-hearth-300">
                        New family
                      </span>
                    ) : null}

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
                        <SubmitButton variant="danger" pendingLabel="Revoking…">Revoke</SubmitButton>
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
