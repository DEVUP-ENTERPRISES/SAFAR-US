'use client';

import { useQuery } from '@tanstack/react-query';
import { Car, Handshake, Warehouse } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Donut } from '@/components/ui/charts';
import { formatMoney } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const ICON: Record<string, typeof Car> = {
  'Host (self-serve)': Car,
  'Asset Partners': Handshake,
  'House Fleet': Warehouse,
};

export default function RevenueBySourcePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-revenue-source'],
    queryFn: () => adminApi.revenueBySource(),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const cur = data.currency;
  const m = (v: number) => formatMoney({ amount: v, currency: cur });
  const totalGmv = data.sources.reduce((s, x) => s + x.gmv, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Revenue by Source"
        description="Who supplied the car, not what the fee was — Host self-serve, Asset Partners and House Fleet each run different economics."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {data.sources.map((s) => {
          const Icon = ICON[s.label] ?? Car;
          const share = totalGmv > 0 ? Math.round((s.gmv / totalGmv) * 100) : 0;
          return (
            <Card key={s.label} className="rounded-2xl shadow-soft">
              <CardContent className="space-y-3 py-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{m(s.gmv)}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.trips} trip{s.trips === 1 ? '' : 's'} · {share}% of GMV
                  </p>
                </div>
                <div className="border-t border-border pt-2.5 text-sm">
                  <span className="text-muted-foreground">Platform revenue </span>
                  <span className="font-semibold">{m(s.platformRevenue)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader><CardTitle>Share of GMV by source</CardTitle></CardHeader>
        <CardContent>
          {totalGmv > 0 ? (
            <Donut data={data.sources.map((s) => ({ label: s.label, value: s.gmv }))} currency={cur} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No revenue yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
