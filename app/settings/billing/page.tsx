import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireHouseholdParent } from "@/lib/auth/session";
import { householdUsage } from "@/lib/billing/usage";
import { UNLIMITED, describeAllowance } from "@/lib/billing/plans";
import { purchasablePlans, webhookSecret } from "@/lib/billing/stripe-plans";
import { canOpenPortal } from "@/lib/billing/checkout";
import { Alert, Card, PageTitle } from "@/components/ui";
import { ManageSubscription } from "./plan-forms";

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = {
  HEARTH: "Hearth",
  HOMESTEAD: "Homestead",
  KEEP: "Keep",
  UNMETERED: "Unmetered",
};

/**
 * What this family is paying for, and how to change it.
 *
 * The account, not the shop. What a family *could* have — the whole library,
 * with what a larger plan opens said out loud — is `/settings/store`, and the
 * two are apart on purpose: putting a cancel button on a shop front is how you
 * get people cancelling.
 *
 * **Nothing on this page is the authority on anything.** A family's plan
 * changes when Stripe tells the webhook it changed, which is why coming back
 * from a successful checkout says *"this may take a moment"* rather than
 * congratulating anybody on a plan the app has not been told about yet. The
 * alternative — trusting the redirect — means a page that says Homestead while
 * the database says Hearth, and a family who believes the page.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; cancelled?: string }>;
}) {
  const actor = await requireHouseholdParent();
  const { done, cancelled } = await searchParams;

  if (!actor.householdId) redirect("/settings");

  const [usage, subscription] = await Promise.all([
    householdUsage(actor.householdId),
    db.subscription.findUnique({
      where: { householdId: actor.householdId },
      select: { externalCustomerId: true, externalSubscriptionId: true, currentPeriodEnd: true },
    }),
  ]);

  const { entitlements } = usage;
  const selling = webhookSecret() !== null && purchasablePlans().length > 0;
  const managing = canOpenPortal({ actor: { householdRole: actor.user.householdRole }, subscription });
  const unmetered = entitlements.turnsPerMonth >= UNLIMITED;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Your household"
        title="What you are paying for"
        lead="Everything you have written stays yours whatever happens here — a plan decides how much more you can add, never what you keep."
      />

      <p className="mb-6">
        <Link href="/settings" className="text-sm text-hearth-400 underline hover:text-hearth-200">
          ← Back to settings
        </Link>
      </p>

      {done ? (
        <div className="mb-6">
          {/* Deliberately not "you are now on Homestead". Stripe tells this app
              what happened through the webhook, and that can land a second or
              two after the browser does. Saying so is honest and stops the page
              contradicting the database. */}
          <Alert tone="success">
            Thank you. Stripe is letting us know — this page may take a moment to catch up, so
            reload it if the plan below still reads as it did.
          </Alert>
        </div>
      ) : null}

      {cancelled ? (
        <div className="mb-6">
          <Alert>Nothing was set up, and nothing has changed.</Alert>
        </div>
      ) : null}

      <Card className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-hearth-100">
            {PLAN_NAMES[entitlements.plan] ?? entitlements.plan}
          </h2>
          {entitlements.status === "ACTIVE" ? null : (
            <span className="text-sm text-amber-300">{entitlements.status.toLowerCase()}</span>
          )}
        </div>

        {unmetered ? (
          <p className="mt-2 text-sm text-hearth-200/70">
            Nothing is counted or capped on this plan — play as much as you like.
          </p>
        ) : (
          <ul className="mt-3 grid gap-1.5 text-sm text-hearth-200/80 sm:grid-cols-2">
            <li>{describeAllowance(usage.turns, entitlements.turnsPerMonth)} turns this month</li>
            <li>{describeAllowance(usage.campaigns, entitlements.campaigns)} adventures on the go</li>
            <li>{describeAllowance(usage.seatsTaken, entitlements.seats)} places in the family</li>
            <li>
              {describeAllowance(usage.links, entitlements.linkedHouseholds)} families you adventure
              with
            </li>
          </ul>
        )}

        {subscription?.currentPeriodEnd ? (
          <p className="mt-3 text-sm text-hearth-400">
            Next renewal {subscription.currentPeriodEnd.toLocaleDateString()}.
          </p>
        ) : null}

        {entitlements.status === "PAST_DUE" ? (
          <p className="mt-3 text-sm text-amber-200/90">
            There is a problem with the payment. Adventures already under way carry on as normal —
            nothing new can be started until it is sorted out.
          </p>
        ) : null}

        {managing ? (
          <div className="mt-4">
            <ManageSubscription />
            <p className="mt-2 text-xs text-hearth-500">
              Changing your card, changing plan and stopping all happen on Stripe&rsquo;s own page.
            </p>
          </div>
        ) : null}
      </Card>

      {!selling ? (
        <Card>
          <p className="text-sm text-hearth-300">
            This copy of Hearthlight does not sell subscriptions — whoever runs it decides what each
            family may do, and there is nothing to pay.
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="font-display mb-2 text-lg text-hearth-100">What else is there?</h2>
          <p className="mb-4 text-sm text-hearth-200/70">
            The shelf has every adventure on this server on it, with what a larger plan would open
            said out loud. It is the page to decide from; this one is for what you are already
            paying.
          </p>
          <Link
            href="/settings/store"
            className="inline-block rounded-lg bg-hearth-600 px-4 py-2 font-medium text-hearth-50 hover:bg-hearth-500"
          >
            See the shelf
          </Link>
        </Card>
      )}

      <p className="mt-8 text-sm text-hearth-400">
        Stopping does not delete anything. Your adventurers, your chronicle and every adventure you
        have written stay exactly where they are and stay readable — a plan only decides what you
        can start next.
      </p>
    </main>
  );
}
