import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { SETTINGS_ID } from "@/lib/ai/settings";
import { costOf, formatCost, summarise, type Prices } from "@/lib/ai/usage";
import { Alert, Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Enough to see a pattern without loading a year of rows into a page. */
const RECENT = 40;

export default async function UsagePage() {
  await requireAdmin();

  const settings = await db.aiSetting.findUnique({ where: { id: SETTINGS_ID } });
  const prices: Prices = {
    inputPer1M: settings?.inputPricePer1M ?? null,
    outputPer1M: settings?.outputPricePer1M ?? null,
    perImage: settings?.imagePrice ?? null,
    currency: settings?.currency ?? "USD",
  };

  const [calls, recent, images, campaigns] = await Promise.all([
    db.aiCall.findMany({
      select: {
        stage: true,
        model: true,
        ok: true,
        repairs: true,
        inputTokens: true,
        outputTokens: true,
        campaignId: true,
      },
    }),
    db.aiCall.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT,
      include: { campaign: { select: { title: true } } },
    }),
    db.sceneImage.count(),
    db.campaign.findMany({ select: { id: true, title: true } }),
  ]);

  const titles = new Map(campaigns.map((campaign) => [campaign.id, campaign.title]));

  const byStage = summarise(calls, (call) => call.stage, prices);
  const byModel = summarise(calls, (call) => call.model, prices);
  const byCampaign = summarise(
    calls,
    (call) => titles.get(call.campaignId ?? "") ?? "Outside any adventure",
    prices,
  );

  const totals = calls.reduce(
    (running, call) => ({
      calls: running.calls + 1,
      inputTokens: running.inputTokens + (call.inputTokens ?? 0),
      outputTokens: running.outputTokens + (call.outputTokens ?? 0),
      failures: running.failures + (call.ok ? 0 : 1),
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, failures: 0 },
  );

  const wordCost = costOf(totals, prices);
  const pictureCost = prices.perImage === null ? null : prices.perImage * images;
  const everything =
    wordCost === null && pictureCost === null ? null : (wordCost ?? 0) + (pictureCost ?? 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageTitle
        eyebrow="Settings"
        title="What it has used"
        lead="Every call the storyteller has made since this was deployed, and what it actually said when a turn came out strange."
      />

      <div className="mb-6">
        <Link href="/settings" className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← Settings
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="font-display mb-4 text-xl text-hearth-100">Altogether</h2>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Calls" value={totals.calls.toLocaleString()} />
            <Figure label="Sent" value={`${Math.round(totals.inputTokens / 1000)}k tokens`} />
            <Figure label="Written" value={`${Math.round(totals.outputTokens / 1000)}k tokens`} />
            <Figure label="Pictures" value={images.toLocaleString()} />
          </dl>

          <p className="mt-5 text-hearth-100">
            {everything === null ? (
              <span className="text-hearth-300">
                No prices set, so this is counted rather than costed.
              </span>
            ) : (
              <>
                <span className="font-display text-3xl">
                  {formatCost(everything, prices.currency)}
                </span>
                <span className="ml-3 text-sm text-hearth-400">
                  {formatCost(wordCost, prices.currency)} of words
                  {pictureCost !== null
                    ? ` · ${formatCost(pictureCost, prices.currency)} of pictures`
                    : ""}
                </span>
              </>
            )}
          </p>

          {totals.failures > 0 ? (
            <p className="mt-3 text-sm text-hearth-400">
              {totals.failures} {totals.failures === 1 ? "call" : "calls"} failed. A failed call is
              usually the model server being unreachable, and the table sees a &ldquo;try
              again&rdquo; rather than a broken turn.
            </p>
          ) : null}

          {everything === null ? (
            <div className="mt-4">
              <Alert tone="info">
                Add what your provider charges under{" "}
                <Link href="/settings/storyteller" className="underline hover:text-hearth-100">
                  the storyteller
                </Link>{" "}
                and this becomes money. Prices are not built in on purpose — they change monthly and
                differ per provider, so a number in the code would be wrong by the time you read it.
              </Alert>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">Where it goes</h2>
          <p className="mb-4 text-sm text-hearth-400">
            A turn is four calls: deciding what needs a roll, narrating the result, extracting what
            changed, and occasionally summarising a closed chapter. Narration is the expensive one,
            and the one worth a better model.
          </p>
          <UsageTable rows={byStage} currency={prices.currency} />
        </Card>

        {byCampaign.length > 1 ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">By adventure</h2>
            <UsageTable rows={byCampaign} currency={prices.currency} />
          </Card>
        ) : null}

        {byModel.length > 1 ? (
          <Card>
            <h2 className="font-display mb-4 text-xl text-hearth-100">By model</h2>
            <UsageTable rows={byModel} currency={prices.currency} />
          </Card>
        ) : null}

        <Card>
          <h2 className="font-display mb-1 text-xl text-hearth-100">The last {RECENT} calls</h2>
          <p className="mb-4 text-sm text-hearth-400">
            What was actually sent and what came back, truncated. This is the answer to &ldquo;why
            did it say that?&rdquo; — a question no amount of staring at the transcript resolves.
          </p>

          {recent.length === 0 ? (
            <Alert tone="info">Nothing yet. Play a turn and it will show up here.</Alert>
          ) : (
            <div className="space-y-2">
              {recent.map((call) => (
                <details
                  key={call.id}
                  className="rounded-lg border border-hearth-800/60 bg-hearth-900/20 p-3"
                >
                  <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 text-sm">
                    <span className={call.ok ? "text-hearth-200" : "text-red-300"}>
                      {call.stage}
                    </span>
                    <span className="text-hearth-500">{call.campaign?.title ?? "—"}</span>
                    <span className="text-hearth-500">{call.latencyMs}ms</span>
                    {call.repairs > 0 ? (
                      <span className="text-hearth-400">
                        {call.repairs} {call.repairs === 1 ? "repair" : "repairs"}
                      </span>
                    ) : null}
                    {call.inputTokens !== null ? (
                      <span className="text-hearth-500">
                        {call.inputTokens}→{call.outputTokens ?? 0}
                      </span>
                    ) : null}
                    <span className="text-hearth-600">
                      {call.createdAt.toLocaleString("en-GB")}
                    </span>
                  </summary>

                  {call.error ? (
                    <p className="mt-3 text-sm text-red-300">{call.error}</p>
                  ) : null}

                  <div className="mt-3 space-y-3">
                    <div>
                      <h3 className="mb-1 text-xs tracking-wide text-hearth-500 uppercase">Sent</h3>
                      <pre className="max-h-64 overflow-auto rounded bg-hearth-950/60 p-3 text-xs whitespace-pre-wrap text-hearth-200/80">
                        {call.promptPreview ?? "(not recorded)"}
                      </pre>
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs tracking-wide text-hearth-500 uppercase">
                        Came back
                      </h3>
                      <pre className="max-h-64 overflow-auto rounded bg-hearth-950/60 p-3 text-xs whitespace-pre-wrap text-hearth-200/80">
                        {call.responsePreview ?? "(not recorded)"}
                      </pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-hearth-400 uppercase">{label}</dt>
      <dd className="font-display text-xl text-hearth-100">{value}</dd>
    </div>
  );
}

function UsageTable({
  rows,
  currency,
}: {
  rows: { key: string; calls: number; inputTokens: number; outputTokens: number; failures: number; cost: number | null }[];
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-hearth-500">Nothing recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs tracking-wide text-hearth-500 uppercase">
            <th className="pb-2 font-medium">&nbsp;</th>
            <th className="pb-2 text-right font-medium">Calls</th>
            <th className="pb-2 text-right font-medium">Sent</th>
            <th className="pb-2 text-right font-medium">Written</th>
            <th className="pb-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-hearth-800/50">
              <td className="py-2 text-hearth-200">
                {row.key}
                {row.failures > 0 ? (
                  <span className="ml-2 text-xs text-red-300">{row.failures} failed</span>
                ) : null}
              </td>
              <td className="py-2 text-right text-hearth-300">{row.calls.toLocaleString()}</td>
              <td className="py-2 text-right text-hearth-400">
                {Math.round(row.inputTokens / 1000)}k
              </td>
              <td className="py-2 text-right text-hearth-400">
                {Math.round(row.outputTokens / 1000)}k
              </td>
              <td className="py-2 text-right text-hearth-200">{formatCost(row.cost, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
