'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { formatMoney } from '@/lib/utils/format';
import { StatementCard } from '@/features/asset-partners/components/statement-card';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { NotAPartner } from '@/features/asset-partners/components/not-a-partner';

/**
 * The statement archive.
 *
 * The partner agreement promises an itemised monthly statement; before this
 * the only one a partner could see was the current month, on the dashboard.
 * Twelve months back, each fully broken down and per-vehicle.
 */
export default function PartnerStatementsPage() {
  const [months, setMonths] = useState(12);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['asset-partner-statements', months],
    queryFn: () => assetPartnerApi.statements(months),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError && error instanceof ApiError && error.status === 403) {
    return <div className="py-8"><NotAPartner /></div>;
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t load your statements." retry={() => refetch()} />
      </div>
    );
  }

  const currency = data[0]?.currency ?? 'USD';
  // Closed months only for the totals and the chart — the running month is
  // incomplete, and averaging it in would understate every figure.
  const closed = data.filter((s) => s.final);
  const lifetimeNet = closed.reduce((sum, s) => sum + s.totals.net, 0);
  const lifetimeGross = closed.reduce((sum, s) => sum + s.totals.gross, 0);
  const bestMonth = closed.reduce<null | (typeof closed)[number]>(
    (best, s) => (!best || s.totals.net > best.totals.net ? s : best),
    null,
  );

  return (
    <div className="space-y-8 py-8">
      <PageHeader
        eyebrow="Asset Partners"
        title="Statements"
        description="Every month, itemised — gross, management fee, insurance, detailing and your net."
      />

      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {[6, 12, 24].map((m) => (
          <Chip key={m} active={months === m} onClick={() => setMonths(m)}>
            Last {m} months
          </Chip>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState title="No statements yet" description="Your first statement appears once your car completes a trip." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Net, closed months"
              value={formatMoney({ amount: lifetimeNet, currency })}
              sub={`${closed.length} month${closed.length === 1 ? '' : 's'}`}
              tone={lifetimeNet >= 0 ? 'success' : 'warning'}
            />
            <StatTile label="Gross, closed months" value={formatMoney({ amount: lifetimeGross, currency })} />
            <StatTile
              label="Best month"
              value={bestMonth ? formatMoney({ amount: bestMonth.totals.net, currency }) : '—'}
              sub={bestMonth?.period}
            />
          </div>

          {closed.length > 1 && (
            <Card>
              <CardContent className="pt-6">
                <BarChart
                  data={closed
                    .slice()
                    .reverse()
                    .map((s) => ({ label: s.period.slice(5), value: s.totals.net }))}
                  currency={currency}
                />
              </CardContent>
            </Card>
          )}

          <section className="space-y-4">
            <h2 className="display flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5 text-primary" /> Month by month
            </h2>
            {data.map((s) => (
              <StatementCard key={s.period} statement={s} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
