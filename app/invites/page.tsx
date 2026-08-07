import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { revokeInviteAction } from "@/lib/auth/actions";
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
  await requireAdmin();

  const invites = await db.inviteCode.findMany({
    include: { redeemedBy: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Administration"
        title="Invite codes"
        lead="Hearthlight is invite-only. Create a code for each person you want to let in."
      />

      <div className="space-y-6">
        <Card>
          <InviteForm />
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

                    <span className="min-w-0 flex-1 truncate text-sm text-hearth-400">
                      {invite.redeemedBy
                        ? `Used by ${invite.redeemedBy.displayName}`
                        : (invite.note ?? (invite.isBootstrap ? "Bootstrap code" : ""))}
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
