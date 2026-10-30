'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BellOff, CalendarClock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { useAdminList } from '@/features/admin/hooks/use-admin-list';
import { RETURN_REASON, RETURN_STATUS, returnsManageApi, type ReturnRow, type WatchRow } from '@/features/asset-partners/returns-api';
import type { ReturnReason, ReturnStatus } from '@/features/asset-partners/api';
import { formatDate } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = returnsManageApi('/ioc');

const STATUSES: { value: ReturnStatus | 'open' | ''; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'requested', label: 'New' },
  { value: 'submitted', label: 'Needs approval' },
  { value: 'completed', label: 'Returned' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
];

const REASONS: { value: ReturnReason | ''; label: string }[] = [
  { value: '', label: 'Every reason' },
  { value: 'partner_request', label: 'Partner asked' },
  { value: 'unresponsive', label: 'Can’t reach' },
  { value: 'deceased', label: 'Passed away' },
];

function WatchList() {
  const q = useQuery({ queryKey: ['ioc-return-watch'], queryFn: () => manage.watchList() });
  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load the watch list." retry={() => void q.refetch()} />;
  const groups: { title: string; icon: React.ReactNode; rows: WatchRow[]; detail: (r: WatchRow) => string; empty: string }[] = [
    { title: `No portal visit in ${q.data.quietAfterDays}+ days`, icon: <BellOff className="h-4 w-4" />, rows: q.data.quiet, detail: (r) => (r.lastSeenAt ? `Last seen ${formatDate(r.lastSeenAt)}` : 'Never signed in'), empty: 'Everyone has been in touch recently.' },
    { title: 'Visa ending within 45 days', icon: <CalendarClock className="h-4 w-4" />, rows: q.data.visa, detail: (r) => (r.visaExpiry ? `Visa ends ${formatDate(r.visaExpiry)}` : ''), empty: 'No visas ending soon.' },
    { title: 'No emergency contact', icon: <Users className="h-4 w-4" />, rows: q.data.noEmergencyContact, detail: () => 'Ask them to add one in their profile', empty: 'Every active partner has one.' },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.title} className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">{g.icon}{g.title}<Badge tone={g.rows.length ? 'warning' : 'muted'} className="ms-auto tabular-nums">{g.rows.length}</Badge></CardTitle>
          </CardHeader>
          <CardContent>
            {g.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{g.empty}</p>
            ) : (
              <ul className="space-y-2">
                {g.rows.slice(0, 8).map((r) => (
                  <li key={r._id} className="min-w-0 text-sm">
                    <Link href={`/ops/partners/members/${r._id}`} className="font-medium text-primary hover:underline">{r.displayName}</Link>
                    <p className="truncate text-xs text-muted-foreground">{g.detail(r)}{r.phone ? ` · ${r.phone}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PartnerReturnsPage() {
  const [status, setStatus] = useState<ReturnStatus | 'open' | ''>('open');
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const list = useAdminList<ReturnRow>('/ioc/asset-partner-exits', { status: status || undefined, reason: reason || undefined });

  const columns: Column<ReturnRow>[] = [
    {
      header: 'Partner',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.partnerName}</p>
          <p className="font-mono text-xs text-muted-foreground">{r.reference}</p>
        </div>
      ),
    },
    { header: 'Why', cell: (r) => <span className="text-sm">{RETURN_REASON[r.reason]}</span> },
    { header: 'Cars', cell: (r) => <span className="text-sm">{r.cars.map((c) => c.label).join(', ')}</span>, hideOnMobile: true },
    {
      header: 'Date',
      cell: (r) => (
        <span className="text-xs">
          {r.scheduledFor ? formatDate(r.scheduledFor) : r.noticeEndsAt ? `Notice ends ${formatDate(r.noticeEndsAt)}` : r.preferredDate ? `Asked for ${formatDate(r.preferredDate)}` : formatDate(r.createdAt)}
        </span>
      ),
    },
    { header: 'Runner', cell: (r) => <span className="text-sm">{r.runner?.name ?? '—'}</span>, hideOnMobile: true },
    { header: 'Status', cell: (r) => <Badge tone={RETURN_STATUS[r.status].tone}>{RETURN_STATUS[r.status].label}</Badge> },
    { header: '', className: 'text-end', cell: (r) => <Link href={`/ops/partners/returns/${r._id}`} className="text-sm font-medium text-primary hover:underline">Open →</Link> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Asset management" title="Returns" description="Cars going back to their owners: partners who asked, partners we can’t reach, and estates. A runner does the checklist; someone else approves it." />
      <PartnersNav />
      <WatchList />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">{STATUSES.map((o) => <Chip key={o.label} active={status === o.value} onClick={() => setStatus(o.value)}>{o.label}</Chip>)}</div>
        <div className="flex flex-wrap gap-2">{REASONS.map((o) => <Chip key={o.label} active={reason === o.value} onClick={() => setReason(o.value)}>{o.label}</Chip>)}</div>
      </div>
      <DataTable
        columns={columns}
        rows={list.rows}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        paging={list.paging}
        errorMessage="We couldn’t load returns."
        emptyTitle={status === 'open' ? 'No open returns' : 'Nothing matches'}
        emptyDescription={status === 'open' ? 'Start one from a partner’s page, or wait for a partner to ask from their portal.' : 'Try another filter.'}
      />
    </div>
  );
}
