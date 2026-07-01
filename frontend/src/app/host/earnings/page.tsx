'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/utils/format';
import { useEarnings } from '@/features/host/hooks';

export default function EarningsPage() {
  const { data, isLoading } = useEarnings();
  const cur = data?.currency ?? 'INR';

  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (!data) return null;

  const max = Math.max(1, ...data.monthly.map((m) => m.amount));

  const stats = [
    { label: 'Lifetime earnings', value: data.lifetimeEarnings },
    { label: 'Available balance', value: data.currentBalance },
    { label: 'Pending payout', value: data.pendingPayout },
    { label: 'Paid out', value: data.paidOut },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Earnings</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{formatMoney({ amount: s.value, currency: cur })}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Revenue (last months)</CardTitle></CardHeader>
        <CardContent>
          {data.monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revenue yet.</p>
          ) : (
            <div className="flex items-end gap-3" style={{ height: 200 }}>
              {data.monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-primary/80"
                      style={{ height: `${(m.amount / max) * 100}%` }}
                      title={formatMoney({ amount: m.amount, currency: cur })}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Completed trips: <span className="font-medium text-foreground">{data.completedTrips}</span>. Payouts
        are released after the trip-completion hold window.
      </p>
    </div>
  );
}
