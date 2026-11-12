'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { ErrorState } from '@/components/ui/states';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { partnerManageApi, type FeeReportRow } from '@/features/asset-partners/manage-api';
import { formatDate, formatMoney } from '@/lib/utils/format';

type Row = FeeReportRow & { _id: string };

const STATUS: Record<FeeReportRow['status'], { label: string; tone: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  paid: { label: 'Paid', tone: 'success' },
  due: { label: 'Waiting', tone: 'warning' },
  waived: { label: 'Waived', tone: 'muted' },
  refunded: { label: 'Refunded', tone: 'destructive' },
  none: { label: 'Not set', tone: 'muted' },
};

/** Asset Partner registration fee revenue, kept apart from trip revenue; the same numbers in admin and the operations panel. */
export function PartnerFeeReport({ base, partnerHref }: { base: '/admin' | '/ioc'; partnerHref?: (partnerId: string) => string }) {
  const q = useQuery({ queryKey: ['partner-fee-report', base], queryFn: () => partnerManageApi(base).feeReport() });
  const usd = (amount: number) => formatMoney({ amount, currency: q.data?.currency ?? 'USD' });
  const rows = useMemo<Row[] | undefined>(() => q.data?.rows.map((r) => ({ ...r, _id: r.partnerId })), [q.data]);

  const columns: Column<Row>[] = [
    { header: 'Partner', cell: (r) => (partnerHref ? <Link href={partnerHref(r.partnerId)} className="font-medium text-primary hover:underline">{r.name}</Link> : <span className="font-medium">{r.name}</span>), sortValue: (r) => r.name },
    { header: 'Status', cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>, sortValue: (r) => r.status },
    { header: 'Amount', numeric: true, cell: (r) => (r.totalCents > 0 ? usd(r.paidCents ?? r.totalCents) : '—'), sortValue: (r) => r.paidCents ?? r.totalCents },
    { header: 'Platform fee', numeric: true, hideOnMobile: true, cell: (r) => (r.platformFeeCents > 0 ? usd(r.platformFeeCents) : '—') },
    { header: 'Date', cell: (r) => { const d = r.refundedAt ?? r.paidAt ?? r.setAt; return d ? formatDate(d) : '—'; }, sortValue: (r) => r.refundedAt ?? r.paidAt ?? r.setAt ?? '' },
  ];

  if (q.isError) return <ErrorState message="We couldn’t load registration fees." retry={() => void q.refetch()} />;

  return (
    <section className="space-y-4" aria-labelledby="partner-fees-title">
      <div>
        <h2 id="partner-fees-title" className="text-xl font-semibold">Asset Partner registration fees</h2>
        <p className="text-sm text-muted-foreground">One-time, non-refundable. Separate from trip revenue.</p>
      </div>
      {q.isLoading || !q.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Collected" value={usd(q.data.collectedCents)} sub={`${q.data.paidCount} paid`} tone="primary" />
          <StatTile label="Platform fee in that" value={usd(q.data.platformFeeCents)} />
          <StatTile label="Waiting to be paid" value={usd(q.data.dueCents)} sub={`${q.data.dueCount} partner${q.data.dueCount === 1 ? '' : 's'}`} />
          <StatTile label="Refunded" value={usd(q.data.refundedCents)} sub={`${q.data.refundedCount} refund${q.data.refundedCount === 1 ? '' : 's'}${q.data.waivedCount ? ` · ${q.data.waivedCount} waived` : ''}`} />
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Latest registration fees</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={q.isLoading}
            isError={q.isError}
            onRetry={() => void q.refetch()}
            errorMessage="We couldn’t load registration fees."
            emptyTitle="No registration fees yet"
            emptyDescription="Fees appear here once a partner is approved with a fee."
            caption={q.data && q.data.rows.length >= 50 ? 'Latest 50' : undefined}
          />
        </CardContent>
      </Card>
    </section>
  );
}
