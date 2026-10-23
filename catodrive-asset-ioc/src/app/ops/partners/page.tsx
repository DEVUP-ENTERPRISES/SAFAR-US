'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Car, ChevronRight, ClipboardCheck, FileText, Handshake, Percent, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { formatMoney } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';
import { MonthSelect, monthOptions } from '~/features/partners/month-select';

const manage = partnerManageApi('/ioc');
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const monthLabel = (period: string) => new Date(`${period}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Line({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className={strong ? 'flex items-baseline justify-between gap-4 border-t border-border pt-3 font-semibold' : 'flex items-baseline justify-between gap-4'}>
      <span className="min-w-0">
        <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

function Todo({ href, icon, label, count, done }: { href: string; icon: React.ReactNode; label: string; count: string; done: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-accent/40">
      <span className={done ? 'text-muted-foreground' : 'text-warning'}>{icon}</span>
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <span className={done ? 'text-sm text-muted-foreground' : 'text-sm font-semibold'}>{count}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default function AssetOverviewPage() {
  const months = useMemo(() => monthOptions(12, true), []);
  const [period, setPeriod] = useState(months[0].value);
  const q = useQuery({ queryKey: ['ioc-asset-overview', period], queryFn: () => manage.overview(period) });
  const summary = useQuery({ queryKey: ['ioc-partner-summary'], queryFn: () => manage.summary() });
  const o = q.data;
  const waiting = (summary.data?.applications.submitted ?? 0) + (summary.data?.applications.under_review ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Asset management"
        title="Overview"
        description="Partner cars, what they earned, CatoDrive’s fee and what each partner is owed. Every number comes from the partners’ own statements."
        actions={<MonthSelect months={months} value={period} onChange={setPeriod} />}
      />
      <PartnersNav />

      {q.isLoading ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : q.isError || !o ? (
        <ErrorState message="We couldn’t load the overview." retry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={<Car className="h-5 w-5" />} label="Cars in the programme" value={o.cars.inProgramme} sub={`${o.cars.listed} listed${o.cars.returned ? ` · ${o.cars.returned} returned` : ''}`} href="/ops/partners/cars" />
            <StatTile icon={<Handshake className="h-5 w-5" />} label="Partners" value={o.partners.active} sub={o.partners.onboarding ? `${o.partners.onboarding} still onboarding` : 'Active'} href="/ops/partners/members" />
            <StatTile icon={<Banknote className="h-5 w-5" />} label="Bookings on partner cars" value={usd(o.month.gross)} sub={`${o.month.trips} trip${o.month.trips === 1 ? '' : 's'} completed`} />
            <StatTile tone="success" icon={<Percent className="h-5 w-5" />} label="CatoDrive management fee" value={usd(o.month.managementFee)} sub="Kept from partner bookings" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Where the money went · {monthLabel(o.period)}</CardTitle></CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <Line label="Bookings on partner cars" value={usd(o.month.gross)} hint="Rental, cleaning, extras and delivery. Not the guest service fee or tax." />
                <Line label="CatoDrive management fee" value={`−${usd(o.month.managementFee)}`} />
                <Line label="Fleet insurance" value={`−${usd(o.month.insurance)}`} hint="Per car, every month it’s in the programme" />
                <Line label="Professional detailing" value={`−${usd(o.month.detailing)}`} hint="Per car, every month it’s in the programme" />
                <Line label="Owed to partners" value={usd(o.month.partnerNet)} strong />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Needs doing</CardTitle></CardHeader>
              <CardContent className="divide-y divide-border p-0">
                <Todo href="/ops/partners/applications" icon={<FileText className="h-5 w-5" />} label="Applications waiting for review" count={String(waiting)} done={!waiting} />
                <Todo href="/ops/partners/repairs" icon={<Wrench className="h-5 w-5" />} label="Repairs waiting for the owner’s OK" count={String(o.todo.repairsAwaitingPartner)} done={!o.todo.repairsAwaitingPartner} />
                <Todo href="/ops/partners/members" icon={<ClipboardCheck className="h-5 w-5" />} label="Intake reports waiting for the owner" count={String(o.todo.intakesAwaitingPartner)} done={!o.todo.intakesAwaitingPartner} />
                <Todo href="/ops/partners/payouts" icon={<Banknote className="h-5 w-5" />} label={`Still to pay for ${monthLabel(o.todo.lastMonth)}`} count={usd(o.todo.unpaidLastMonth)} done={!o.todo.unpaidLastMonth} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
