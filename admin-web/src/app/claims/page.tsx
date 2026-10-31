'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { useAdminList } from '@/features/admin/hooks/use-admin-list';
import { PERSON_KIND_LABEL } from '@/features/people/types';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { CLAIM_TONE, CLAIM_TYPE } from '../../features/claims/labels';


interface Person { id: string; name: string; kind: keyof typeof PERSON_KIND_LABEL }
interface Row {
  _id: string; type: string; status: string; description: string; createdAt: string; currency?: string;
  amountClaimed?: number; amountApproved?: number; evidence?: unknown[];
  claimant: Person; respondent?: Person; booking?: { id: string; code: string }; vehicle?: { name?: string; plate?: string };
}

export default function AdminClaimsPage() {
  const [status, setStatus] = useState('');
  const list = useAdminList<Row>('/admin/claims', { status: status || undefined });
  const money = (c: Row, amount?: number) => (amount != null ? formatMoney({ amount, currency: c.currency ?? 'USD' }) : '—');

  const columns: Column<Row>[] = [
    {
      header: 'Filed by',
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.claimant?.name}</p>
          <p className="text-xs text-muted-foreground">{PERSON_KIND_LABEL[c.claimant?.kind] ?? 'Customer'} · {CLAIM_TYPE[c.type] ?? c.type}</p>
        </div>
      ),
    },
    { header: 'Against', cell: (c) => <span className="text-sm">{c.respondent?.name ?? <span className="text-muted-foreground">—</span>}</span>, hideOnMobile: true },
    {
      header: 'Trip',
      cell: (c) =>
        c.booking ? (
          <div className="min-w-0 text-sm">
            <p className="truncate">{c.vehicle?.name ?? 'Car'}{c.vehicle?.plate ? ` · ${c.vehicle.plate}` : ''}</p>
            <p className="font-mono text-xs text-muted-foreground">{c.booking.code}</p>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Not linked to a trip</span>
        ),
    },
    { header: 'Claimed', numeric: true, sortValue: (c) => c.amountClaimed ?? 0, cell: (c) => <span className="tabular-nums">{money(c, c.amountClaimed)}</span> },
    { header: 'Evidence', cell: (c) => <span className={(c.evidence?.length ?? 0) === 0 ? 'text-xs text-warning' : 'text-xs text-muted-foreground'}>{c.evidence?.length ?? 0} file{(c.evidence?.length ?? 0) === 1 ? '' : 's'}</span>, hideOnMobile: true },
    { header: 'Filed', cell: (c) => <span className="text-xs">{formatDate(c.createdAt)}</span>, hideOnMobile: true },
    {
      header: 'Status',
      cell: (c) => (
        <div className="flex flex-col items-start gap-0.5">
          <Badge tone={CLAIM_TONE[c.status] ?? 'muted'}>{c.status}</Badge>
          {c.status === 'settled' && <span className="text-xs text-muted-foreground">Paid {money(c, c.amountApproved)}</span>}
        </div>
      ),
    },
    { header: '', className: 'text-end', cell: (c) => <Link href={`/claims/${c._id}`} className="text-sm font-medium text-primary hover:underline">Open case →</Link> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Help & safety" title="Damage claims" description="Claims from guests and hosts. Open a case to see who filed it, the trip, the car, the photos and the money, then decide." />
      <div className="flex flex-wrap gap-2">
        {['', 'opened', 'investigating', 'approved', 'settled', 'rejected'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={list.rows}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        paging={list.paging}
        errorMessage="We couldn’t load claims."
        emptyTitle={status ? 'Nothing matches' : 'No claims filed'}
        emptyDescription={status ? 'Try another filter.' : 'Claims from guests and hosts appear here.'}
      />
    </div>
  );
}
