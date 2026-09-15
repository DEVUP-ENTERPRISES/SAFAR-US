'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Car, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { formatDate } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

interface Application {
  _id: string;
  reference: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected';
  fullName: string;
  businessName?: string;
  email: string;
  vehicle: { year: string; make: string; model: string };
  availability: string;
  createdAt: string;
}

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = {
  approved: 'success', submitted: 'warning', under_review: 'warning', rejected: 'destructive',
};

export default function AssetPartnerApplicationsPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['asset-partner-applications', status],
    queryFn: () => adminApi.assetPartnerApplications({ status: status || undefined }) as Promise<Application[]>,
  });

  const pending = (data ?? []).filter((a) => a.status === 'submitted' || a.status === 'under_review').length;
  const approved = (data ?? []).filter((a) => a.status === 'approved').length;

  const columns: Column<Application>[] = [
    {
      header: 'Applicant',
      cell: (a) => (
        <div>
          <p className="font-medium">{a.fullName}</p>
          <p className="text-xs text-muted-foreground">{a.businessName || a.email}</p>
        </div>
      ),
    },
    {
      header: 'Vehicle',
      cell: (a) => <span>{a.vehicle.year} {a.vehicle.make} {a.vehicle.model}</span>,
    },
    { header: 'Reference', cell: (a) => <span className="font-mono text-xs">{a.reference}</span> },
    { header: 'Submitted', cell: (a) => <span className="text-xs">{formatDate(a.createdAt)}</span> },
    { header: 'Status', cell: (a) => <Badge tone={TONE[a.status] ?? 'muted'}>{a.status.replace('_', ' ')}</Badge> },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (a) => (
        <Link href={adminPath(`asset-partners/${a._id}`)}>
          <span className="text-sm font-medium text-primary hover:underline">Review →</span>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People · Primary acquisition"
        title="Asset Partner Applications"
        description="Vehicle intake submissions from CatoDrive's primary acquisition path. Approving verifies the applicant as a host — the gate before they can list a vehicle."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile tone="warning" icon={<Users className="h-5 w-5" />} label="Awaiting review" value={pending} />
        <StatTile tone="success" icon={<Car className="h-5 w-5" />} label="Approved" value={approved} />
      </div>

      <div className="flex gap-2">
        {['', 'submitted', 'under_review', 'approved', 'rejected'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">
            {s ? s.replace('_', ' ') : 'All'}
          </Chip>
        ))}
      </div>

      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No applications" emptyDescription="Asset Partner intake submissions appear here." />
    </div>
  );
}
