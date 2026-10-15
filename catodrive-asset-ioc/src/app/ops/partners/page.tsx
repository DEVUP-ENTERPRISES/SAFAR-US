'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Car, CheckCircle2, Clock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { APPLICATION_STATUS } from '@/features/asset-partners/status';
import type { ApplicationStatus } from '@/features/asset-partners/api';
import { formatDate } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = partnerManageApi('/ioc');

interface Application {
  _id: string;
  reference: string;
  status: ApplicationStatus;
  kind?: 'partner' | 'vehicle';
  fullName: string;
  businessName?: string;
  email: string;
  vehicle: { year: string; make: string; model: string };
  createdAt: string;
}

const STATUSES: { value: ApplicationStatus | ''; label: string }[] = [
  { value: 'submitted', label: 'New' },
  { value: 'changes_requested', label: 'Needs changes' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Not approved' },
  { value: '', label: 'All' },
];

export default function PartnerApplicationsPage() {
  const [status, setStatus] = useState<ApplicationStatus | ''>('submitted');
  const [kind, setKind] = useState<'' | 'partner' | 'vehicle'>('');
  const summary = useQuery({ queryKey: ['ioc-partner-summary'], queryFn: () => manage.summary() });
  const list = useQuery({
    queryKey: ['ioc-partner-applications', status, kind],
    queryFn: () => manage.applications({ status: status || undefined, kind: kind || undefined, limit: 50 }) as Promise<Application[]>,
  });
  const s = summary.data;

  const columns: Column<Application>[] = [
    {
      header: 'Applicant',
      cell: (a) => (
        <div className="min-w-0">
          <p className="font-medium">{a.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{a.businessName || a.email}</p>
        </div>
      ),
    },
    {
      header: 'Car',
      cell: (a) => (
        <div>
          <p>{a.vehicle.year} {a.vehicle.make} {a.vehicle.model}</p>
          {a.kind === 'vehicle' && <p className="text-xs text-primary">Extra car from a partner</p>}
        </div>
      ),
    },
    { header: 'Sent', cell: (a) => <span className="text-xs">{formatDate(a.createdAt)}</span> },
    { header: 'Status', cell: (a) => <Badge tone={APPLICATION_STATUS[a.status]?.tone ?? 'muted'}>{APPLICATION_STATUS[a.status]?.label ?? a.status}</Badge> },
    {
      header: '',
      className: 'text-end',
      cell: (a) => <Link href={`/ops/partners/applications/${a._id}`} className="text-sm font-medium text-primary hover:underline">Review →</Link>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Asset Partners" title="Applications" description="New partners and extra cars waiting for a decision. Approving a new partner asks them to sign the agreement before their dashboard opens." />
      <PartnersNav />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="warning" icon={<Clock className="h-5 w-5" />} label="Waiting for review" value={(s?.applications.submitted ?? 0) + (s?.applications.under_review ?? 0)} />
        <StatTile icon={<Users className="h-5 w-5" />} label="Needs changes" value={s?.applications.changes_requested ?? 0} />
        <StatTile tone="success" icon={<CheckCircle2 className="h-5 w-5" />} label="Active partners" value={s?.partners.active ?? 0} />
        <StatTile icon={<Car className="h-5 w-5" />} label="Partner cars" value={s?.vehicles ?? 0} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((o) => <Chip key={o.label} active={status === o.value} onClick={() => setStatus(o.value)}>{o.label}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {([['', 'Everything'], ['partner', 'New partners'], ['vehicle', 'Extra cars']] as const).map(([v, label]) => (
            <Chip key={label} active={kind === v} onClick={() => setKind(v)}>{label}</Chip>
          ))}
        </div>
      </div>

      <DataTable columns={columns} rows={list.data} isLoading={list.isLoading} emptyTitle="Nothing here" emptyDescription="Applications from the partner portal appear here." />
    </div>
  );
}
