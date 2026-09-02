'use client';

import { Zap, TrendingUp, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { EarningsInsights } from '@/features/host/components/earnings-insights';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { useEarnings, usePayouts, useInstantPayout } from '@/features/host/hooks';
import { PayoutReadinessCard } from '@/features/host/components/payout-readiness-card';

export default function EarningsPage() {
  const { data, isLoading } = useEarnings();
  const payouts = usePayouts();
  const instant = useInstantPayout();
  const confirm = useConfirm();
  const cur = data?.currency ?? 'USD';

  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (!data) return null;

  const money = (v: number) => formatMoney({ amount: v, currency: cur });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Host"
        title="Earnings"
        description={`${data.completedTrips} completed trip${data.completedTrips === 1 ? '' : 's'}. Payouts release after the trip-completion hold window.`}
      />

      {/* Whether the money can physically reach them. Bank details were being
          collected and used by nothing, so a host could watch a balance grow
          with no idea it could not be sent. */}
      <PayoutReadinessCard />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile tone="primary" icon={<TrendingUp className="h-5 w-5" />} label="Lifetime earnings" value={money(data.lifetimeEarnings)} />
        <StatTile tone="success" icon={<Wallet className="h-5 w-5" />} label="Available balance" value={money(data.currentBalance)} />
        <StatTile tone={data.pendingPayout > 0 ? 'warning' : 'default'} emphasis={data.pendingPayout > 0} icon={<Clock className="h-5 w-5" />} label="Pending payout" value={money(data.pendingPayout)} sub={data.pendingPayout > 0 ? 'Cash out below' : undefined} />
        <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Paid out" value={money(data.paidOut)} />
      </div>

      {/* Instant payout */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Instant payout</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Cash out your scheduled earnings now instead of waiting for the hold window.
              A 1.5% fee (min $0.50) applies.
            </p>
            <p className="mt-1 text-lg font-bold">{money(data.pendingPayout)} available</p>
          </div>
          <Button
            disabled={data.pendingPayout <= 0}
            loading={instant.isPending}
            onClick={async () => {
              // Show the exact fee/net before they commit — same maths as the server.
              const fee = Math.max(50, Math.round((data.pendingPayout * 150) / 10000));
              const net = data.pendingPayout - fee;
              const { ok } = await confirm({
                title: 'Cash out instantly?',
                description: (
                  <>
                    You&apos;ll receive <strong>{money(net)}</strong> now instead of{' '}
                    <strong>{money(data.pendingPayout)}</strong> after the hold window — a{' '}
                    <strong>{money(fee)}</strong> instant-payout fee. This cannot be undone.
                  </>
                ),
                confirmLabel: `Cash out ${money(net)}`,
              });
              if (ok) instant.mutate();
            }}
          >
            <Zap className="h-4 w-4" /> Cash out now
          </Button>
        </CardContent>
        {instant.isSuccess && instant.data && (
          <CardContent className="pt-0">
            <p className="text-sm text-success">
              Paid out {formatMoney({ amount: instant.data.net, currency: cur })} ({instant.data.paidCount} payout{instant.data.paidCount === 1 ? '' : 's'}, {formatMoney({ amount: instant.data.fee, currency: cur })} fee) ✓
            </p>
          </CardContent>
        )}
        {instant.isError && (
          <CardContent className="pt-0"><p className="text-sm text-destructive">Payout failed. Please try again.</p></CardContent>
        )}
      </Card>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader><CardTitle>Revenue — last {data.monthly.length} months</CardTitle></CardHeader>
        <CardContent>
          <BarChart
            data={data.monthly.map((mo) => ({ label: mo.month.slice(5), value: mo.amount }))}
            currency={cur}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payout history</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {payouts.isLoading && <Skeleton className="h-20 w-full" />}
          {payouts.data && payouts.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No payouts yet. Complete a trip to start earning.</p>
          )}
          {payouts.data?.map((p) => (
            <div key={p._id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div>
                <p className="font-medium flex items-center gap-1.5">
                  {formatMoney({ amount: p.amount, currency: p.currency })}
                  {p.instant && <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"><Zap className="h-2.5 w-2.5" /> instant</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.status === 'paid' && p.paidAt ? `Paid ${formatDate(p.paidAt)}` : `Scheduled ${formatDate(p.scheduledFor)}`}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                p.status === 'paid' ? 'bg-success/10 text-success' : p.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
              }`}>
                {p.status}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>


      {/* Rates rather than totals — the part a host can act on. */}
      <EarningsInsights />
    </div>
  );
}
