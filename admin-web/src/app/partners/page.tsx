'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

/**
 * Asset Partner programme members.
 *
 * Deliberately not a filter on the hosts list: a partner has a lifecycle
 * (onboarding → active → suspended → exited) and negotiated commercial terms
 * that no host has, and ops acts on both.
 */

const STATUSES = ['', 'onboarding', 'active', 'suspended', 'exited'];

const TONE: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  onboarding: 'warning',
  active: 'success',
  suspended: 'destructive',
  exited: 'muted',
};

export default function AdminAssetPartnersPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-asset-partners', status],
    queryFn: () => adminApi.assetPartners({ status: status || undefined }),
  });

  const columns: Column<any>[] = [
    {
      header: 'Partner',
      cell: (p) => (
        <Link href={adminPath(`partners/${p._id}`)} className="font-medium hover:underline">
          {p.displayName}
        </Link>
      ),
    },
    { header: 'Type', cell: (p) => <span className="capitalize text-xs">{p.partnerType}</span> },
    { header: 'Status', cell: (p) => <Badge tone={TONE[p.status] ?? 'muted'}>{p.status}</Badge> },
    {
      header: 'Terms',
      cell: (p) =>
        // Only flag the exceptions — everyone else is on platform defaults, and
        // saying so on every row would bury the ones that are negotiated.
        p.terms && Object.values(p.terms).some((v) => v !== undefined && v !== null) ? (
          <Badge tone="warning">Negotiated</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Standard</span>
        ),
    },
    {
      header: 'Approved',
      cell: (p) => (
        <span className="text-xs">{p.approvedAt ? formatDate(p.approvedAt) : '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Asset Partners"
        description="Programme members — managed vehicle owners paid a monthly net after the management fee, fleet insurance and detailing."
      />
      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {STATUSES.map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">
            {s || 'All'}
          </Chip>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        emptyTitle="No Asset Partners yet"
        emptyDescription="Partners are enrolled when an Asset Partner application is approved."
      />
    </div>
  );
}
