'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CircleSlash, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { websiteComplianceApi, CLAIM_STATUS, type ClaimStatus, type WebsiteClaim } from '@/features/admin/website-compliance-api';
import { formatDate } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

const overdue = (c: WebsiteClaim) => c.status !== 'suspended' && !!c.nextReviewAt && new Date(c.nextReviewAt).getTime() <= Date.now();

export default function WebsiteClaimsPage() {
  const q = useQuery({ queryKey: ['admin-website-claims'], queryFn: websiteComplianceApi.claims });
  const [filter, setFilter] = useState<'' | 'overdue' | ClaimStatus>('');
  const rows = useMemo(() => (q.data ?? []).filter((c) => (filter === '' ? true : filter === 'overdue' ? overdue(c) : c.status === filter)), [q.data, filter]);
  const all = q.data ?? [];

  const columns: Column<WebsiteClaim>[] = [
    {
      header: 'Claim',
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium">{c.wording}</p>
          <p className="text-xs text-muted-foreground">{c.category.replace('_', ' ')} · {c.pages.join(', ')}</p>
        </div>
      ),
      sortValue: (c) => c.wording,
    },
    { header: 'On the website', cell: (c) => <span className="tabular-nums">{c.live ? c.live.display : c.status === 'suspended' ? 'Hidden' : '—'}</span> },
    { header: 'Owner', cell: (c) => c.owner, sortValue: (c) => c.owner, hideOnMobile: true },
    { header: 'Status', cell: (c) => <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>, sortValue: (c) => c.status },
    {
      header: 'Next review',
      cell: (c) => (c.nextReviewAt ? <span className={overdue(c) ? 'font-semibold text-destructive' : 'text-sm'}>{overdue(c) ? 'Due ' : ''}{formatDate(c.nextReviewAt)}</span> : '—'),
      sortValue: (c) => c.nextReviewAt ?? '',
    },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (c) => <Link href={adminPath(`website-claims/${c.key}`)} className="text-sm font-medium text-primary hover:underline">Open →</Link>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control"
        title="Website claims"
        description="Every figure and promise published on the website, with its evidence, owner and review date. Only approved figures show on the site; a suspended one is taken off it."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile tone="warning" icon={<Clock className="h-5 w-5" />} label="Review due" value={all.filter(overdue).length} />
        <StatTile icon={<AlertTriangle className="h-5 w-5" />} label="Waiting on a step" value={all.filter((c) => ['draft', 'evidence', 'verified', 'legal_review'].includes(c.status)).length} />
        <StatTile tone="success" icon={<BadgeCheck className="h-5 w-5" />} label="Approved" value={all.filter((c) => c.status === 'approved').length} />
        <StatTile icon={<CircleSlash className="h-5 w-5" />} label="Suspended" value={all.filter((c) => c.status === 'suspended').length} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={filter === ''} onClick={() => setFilter('')}>All</Chip>
        <Chip active={filter === 'overdue'} onClick={() => setFilter('overdue')}>Review due</Chip>
        {(Object.keys(CLAIM_STATUS) as ClaimStatus[]).map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>{CLAIM_STATUS[s].label}</Chip>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => void q.refetch()}
        emptyTitle={filter ? 'Nothing matches this filter' : 'No claims yet'}
        emptyDescription={filter ? 'Try another filter.' : 'Published claims are added when the server starts.'}
        caption={`${rows.length} claim${rows.length === 1 ? '' : 's'}`}
      />
    </div>
  );
}
