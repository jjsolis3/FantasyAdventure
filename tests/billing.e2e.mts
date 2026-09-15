/**
 * The webhook, against the running app.
 *
 * `tests/stripe-billing.test.ts` covers everything that can be decided without
 * a database — signatures, the price map, what each Stripe status means. This
 * covers the three things that cannot: **does a forged request actually get
 * turned away by the route**, **is a repeat ignored**, and **does an event that
 * arrives late get refused instead of overwriting the newer one that beat it**.
 *
 * Those last two are why a webhook is not a function call. Stripe delivers at
 * least once, and after a blip it delivers out of order — a
 * `subscription.updated` from thirty seconds ago landing *after* the
 * cancellation that followed it would leave a family showing the wrong state
 * for ever, and no amount of unit testing a pure function catches a missing
 * column.
 *
 * No browser, deliberately: this is an endpoint a machine talks to, and driving
 * Chromium at it would test nothing extra and hide the status codes. No Stripe
 * account either — the requests are signed here with the secret
 * `scripts/e2e.sh` gives the server.
 *
 * Usage:
 *   1. Scratch Postgres, migrated and seeded.
 *   2. Start the app on 3399, with STRIPE_WEBHOOK_SECRET set.
 *   3. DATABASE_URL=… npx tsx tests/billing.e2e.mts
 *
 * Destructive — point it at a scratch database, never a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { signForTesting } from "../lib/billing/stripe-signature.ts";
import { BASE } from "./e2e-helpers.mjs";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://hearthlight@127.0.0.1:5520/hearthlight?schema=public";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_not_a_real_secret";
const PRICE = process.env.STRIPE_PRICE_HOMESTEAD ?? "price_e2e_homestead";
const KEEP_PRICE = process.env.STRIPE_PRICE_KEEP ?? "price_e2e_keep";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

/** Seconds, the way Stripe counts them. */
const T0 = Math.floor(Date.now() / 1000);

type EventOptions = {
  eventId: string;
  householdId: string;
  status?: string;
  price?: string;
  createdAt?: number;
  type?: string;
};

function eventBody(options: EventOptions): string {
  return JSON.stringify({
    id: options.eventId,
    type: options.type ?? "customer.subscription.updated",
    created: options.createdAt ?? T0,
    data: {
      object: {
        id: "sub_e2e",
        status: options.status ?? "active",
        customer: "cus_e2e",
        current_period_start: options.createdAt ?? T0,
        current_period_end: (options.createdAt ?? T0) + 2_592_000,
        metadata: { householdId: options.householdId },
        items: { data: [{ price: { id: options.price ?? PRICE } }] },
      },
    },
  });
}

/** Posts a webhook the way Stripe would, signed unless told otherwise. */
async function deliver(body: string, signature?: string | null) {
  const header =
    signature === undefined ? signForTesting(body, SECRET, Math.floor(Date.now() / 1000)) : signature;

  const response = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(header ? { "stripe-signature": header } : {}),
    },
    body,
  });

  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

async function subscriptionOf(householdId: string) {
  return db.subscription.findUniqueOrThrow({ where: { householdId } });
}

try {
  // A household of its own, made straight through Prisma. Nothing here needs an
  // account or a browser — the webhook does not care who is signed in, which is
  // exactly the property that makes signing it properly the only defence.
  const household = await db.household.create({
    data: {
      name: "The Wrenna family",
      linkCode: `KIN-E2E1-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      subscription: { create: { plan: "HEARTH", status: "TRIALING" } },
    },
    select: { id: true },
  });

  console.log("\n-- A forged request gets nowhere ----------------------------------");

  const unsigned = await deliver(eventBody({ eventId: "evt_unsigned", householdId: household.id }), null);
  check("no signature is a 400", unsigned.status === 400, String(unsigned.status));

  const forged = eventBody({ eventId: "evt_forged", householdId: household.id });
  const wrong = signForTesting(forged, "whsec_not_the_secret", Math.floor(Date.now() / 1000));
  const forgedReply = await deliver(forged, wrong);
  check("a wrong secret is a 400", forgedReply.status === 400, String(forgedReply.status));

  const stale = eventBody({ eventId: "evt_stale", householdId: household.id });
  const staleHeader = signForTesting(stale, SECRET, Math.floor(Date.now() / 1000) - 3600);
  const staleReply = await deliver(stale, staleHeader);
  check("an hour-old signature is a 400", staleReply.status === 400, String(staleReply.status));

  const stillTrialing = await subscriptionOf(household.id);
  check(
    "and none of them changed anything",
    stillTrialing.status === "TRIALING" && stillTrialing.plan === "HEARTH",
    `${stillTrialing.plan}/${stillTrialing.status}`,
  );
  check(
    "nor left a record of an event that was never accepted",
    (await db.webhookEvent.count()) === 0,
  );

  console.log("\n-- A real one is applied ------------------------------------------");

  const first = await deliver(eventBody({ eventId: "evt_1", householdId: household.id, createdAt: T0 }));
  check("a signed event is a 200", first.status === 200, String(first.status));
  check("and says it was applied", first.json.applied === true);

  const paid = await subscriptionOf(household.id);
  check("the plan followed the price", paid.plan === "HOMESTEAD", paid.plan);
  check("and the status followed Stripe", paid.status === "ACTIVE", paid.status);
  check("the processor's ids are stored", paid.externalSubscriptionId === "sub_e2e");
  check("and the period it is metered from moved", paid.currentPeriodStart.getTime() === T0 * 1000);

  // The COPPA record. A payment from the parent's own card is one of the
  // methods the FTC recognises for verifiable parental consent, so this is the
  // moment that test is passed and the moment to write it down.
  check("consent was recorded", paid.consentedAt !== null);
  check("and says how", paid.consentMethod === "stripe_payment", paid.consentMethod ?? "none");
  const consentedAt = paid.consentedAt!.getTime();

  console.log("\n-- The same one again does nothing --------------------------------");

  // Stripe delivers at least once. A slow response or a deploy mid-request and
  // the same event arrives twice.
  const repeat = await deliver(eventBody({ eventId: "evt_1", householdId: household.id, createdAt: T0 }));
  check("a repeat is still a 200", repeat.status === 200, String(repeat.status));
  check("but is not applied", repeat.json.applied === false);
  check("and says why", repeat.json.why === "duplicate", String(repeat.json.why));

  console.log("\n-- One that arrives late is refused -------------------------------");

  // Cancel, then deliver an *older* event that says they are paying. Without
  // the ordering guard the second would win and a cancelled family would be
  // back on Homestead for ever.
  const cancel = await deliver(
    eventBody({
      eventId: "evt_2",
      householdId: household.id,
      status: "canceled",
      type: "customer.subscription.deleted",
      createdAt: T0 + 60,
    }),
  );
  check("the cancellation applies", cancel.json.applied === true);
  check("and the family is cancelled", (await subscriptionOf(household.id)).status === "CANCELED");

  const late = await deliver(
    eventBody({
      eventId: "evt_3",
      householdId: household.id,
      status: "active",
      price: KEEP_PRICE,
      createdAt: T0 + 30,
    }),
  );
  check("a later delivery of an earlier event is a 200", late.status === 200, String(late.status));
  check("and is refused", late.json.why === "out-of-order", String(late.json.why));

  const afterLate = await subscriptionOf(household.id);
  check("the cancellation stands", afterLate.status === "CANCELED", afterLate.status);
  check("and nobody was quietly upgraded", afterLate.plan === "HOMESTEAD", afterLate.plan);

  // The control. The ordering guard must refuse *older* events, not all of
  // them — a guard that refused everything would pass every check above while
  // making the endpoint useless.
  const newer = await deliver(
    eventBody({
      eventId: "evt_4",
      householdId: household.id,
      status: "active",
      price: KEEP_PRICE,
      createdAt: T0 + 120,
    }),
  );
  check("but a genuinely newer event still applies", newer.json.applied === true);
  const resumed = await subscriptionOf(household.id);
  check("and moves the plan", resumed.plan === "KEEP", resumed.plan);
  check("and the status", resumed.status === "ACTIVE", resumed.status);
  check(
    "while consent keeps the date it was actually given",
    resumed.consentedAt?.getTime() === consentedAt,
  );

  console.log("\n-- Events about nothing we own ------------------------------------");

  const stranger = await deliver(
    eventBody({ eventId: "evt_5", householdId: "hh_not_here", createdAt: T0 + 200 }),
  );
  check("a household we do not have is a 200", stranger.status === 200, String(stranger.status));
  check("and is not applied", stranger.json.why === "unknown-household", String(stranger.json.why));

  const checkout = await deliver(
    JSON.stringify({
      id: "evt_6",
      type: "checkout.session.completed",
      created: T0 + 200,
      data: { object: { id: "cs_1" } },
    }),
  );
  check("a checkout session is acknowledged", checkout.status === 200, String(checkout.status));
  check("and acted on by nothing", checkout.json.why === "ignored", String(checkout.json.why));

  console.log("\n-- What was recorded ----------------------------------------------");

  // Six distinct ids got past the signature — evt_1 to evt_6 — and the repeat
  // reused evt_1 rather than adding a seventh, which is the whole point of
  // keying this table on Stripe's id.
  //
  // Every one of them is here, including the three that changed nothing: an
  // event refused for arriving late, one naming a household we do not have, and
  // a checkout session. They are claimed *before* they are examined, so a
  // delivery Stripe retries is not re-examined every time — and so the record
  // says what actually arrived rather than only what was acted on.
  const recorded = await db.webhookEvent.count();
  check("every delivery that got past the signature left one row", recorded === 6, String(recorded));

  // And nothing that failed verification did — named one by one, because every
  // id in this test begins `evt_` and a prefix check would have counted the
  // forgeries as proof they were absent.
  const forgeries = await db.webhookEvent.count({
    where: { id: { in: ["evt_unsigned", "evt_forged", "evt_stale"] } },
  });
  check("and a request that failed verification left none", forgeries === 0, String(forgeries));
} finally {
  await db.$disconnect();
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
