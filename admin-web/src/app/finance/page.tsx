'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Wallet, Users, Truck, ShieldCheck, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart, LineChart, Donut } from '@/components/ui/charts';
import { formatMoney } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const monthLabel = (m: string) => {
  const [, mm] = m.split('-');
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm)] ?? m;
};

export default function AdminFinancePage() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance', months],
    queryFn: () => adminApi.finance(months),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const cur = data.currency;
  const m = (v: number) => formatMoney({ amount: v, currency: cur });
  const t = data.totals;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Finance"
        description="Every figure here is derived live from the double-entry ledger and bookings — nothing is stored or estimated."
        actions={
          <div className="flex gap-1 rounded-full border border-border p-1">
            {[3, 6, 12].map((n) => (
              <button
                key={n}
                onClick={() => setMonths(n)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  months === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {n}M
              </button>
            ))}
          </div>
        }
      />

      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile tone="primary" icon={<TrendingUp className="h-5 w-5" />} label="GMV" value={m(t.gmv)} sub="Gross booking value" />
        <StatTile tone="success" icon={<Wallet className="h-5 w-5" />} label="Platform revenue" value={m(t.platformRevenue)} sub="Commission taken" />
        <StatTile icon={<Users className="h-5 w-5" />} label="Host earnings" value={m(t.hostEarnings)} sub="Owed to hosts" />
        <StatTile tone={t.payoutsOwed > 0 ? 'warning' : 'default'} emphasis={t.payoutsOwed > 0} icon={<Clock className="h-5 w-5" />} label="Payouts owed" value={m(t.payoutsOwed)} sub={`${m(t.payoutsPaid)} paid to date`} />
      </div>

      {/* GMV + revenue trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader><CardTitle>GMV — last {months} months</CardTitle></CardHeader>
          <CardContent>
            <LineChart data={data.gmvByMonth.map((d) => ({ label: monthLabel(d.month), value: d.amount }))} currency={cur} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-soft">
          <CardHeader><CardTitle>Platform revenue — last {months} months</CardTitle></CardHeader>
          <CardContent>
            <BarChart data={data.revenueByMonth.map((d) => ({ label: monthLabel(d.month), value: d.amount }))} currency={cur} />
          </CardContent>
        </Card>
      </div>

      {/* Revenue mix + supplementary income */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader><CardTitle>Where revenue comes from</CardTitle></CardHeader>
          <CardContent>
            {data.revenueMix.length ? (
              <Donut data={data.revenueMix} currency={cur} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No revenue yet.</p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-soft">
          <CardHeader><CardTitle>Insurance & delivery</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Protection revenue</p>
                <p className="text-xl font-bold">{m(t.protection)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Delivery fees (host income)</p>
                <p className="text-xl font-bold">{m(t.delivery)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground"><Wallet className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Tax collected</p>
                <p className="text-xl font-bold">{m(t.tax)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
