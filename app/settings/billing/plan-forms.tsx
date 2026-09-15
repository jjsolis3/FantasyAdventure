"use client";

import { useActionState } from "react";
import {
  openBillingPortalAction,
  startCheckoutAction,
  type BillingFormState,
} from "@/lib/billing/checkout-actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * The button that sends somebody to Stripe.
 *
 * One per plan rather than a picker and a single button, because the choice and
 * the commitment should be the same click — a select that has to be read, then
 * a button somewhere else, is how people buy the wrong thing.
 */
export function BuyPlan({ plan, label }: { plan: string; label: string }) {
  const [state, action] = useActionState<BillingFormState, FormData>(startCheckoutAction, null);

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton pendingLabel="Taking you to Stripe…">{label}</SubmitButton>
      {state?.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
    </form>
  );
}

/**
 * Stripe's own screen, for changing a card, changing a plan, or stopping.
 *
 * Not rebuilt here on purpose. A cancellation flow, a card form and a proration
 * preview are each a week of work and a compliance surface; Stripe has all
 * three, and whatever somebody does there comes back as a webhook, which is the
 * only thing this app trusts anyway.
 */
export function ManageSubscription() {
  const [state, action] = useActionState<BillingFormState, FormData>(openBillingPortalAction, null);

  return (
    <form action={action}>
      <SubmitButton variant="secondary" pendingLabel="Taking you to Stripe…">
        Manage subscription
      </SubmitButton>
      {state?.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
    </form>
  );
}
