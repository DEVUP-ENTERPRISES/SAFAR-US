'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Users, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { adminApi, type AdminOrg } from '@/features/admin/api';

export default function AdminCorporatePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs', status],
    queryFn: () => adminApi.orgs(status || undefined),
  });

  const setStatusMut = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'active' | 'suspended' }) => adminApi.setOrgStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orgs'] }),
  });

  const totalSpend = (data ?? []).reduce((s, o) => s + o.totalSpend, 0);
  const totalMembers = (data ?? []).reduce((s, o) => s + o.members, 0);

  const suspend = async (o: AdminOrg) => {
    const { ok } = await confirm({
      title: `Suspend ${o.name}?`,
      description:
        'Employees will not be able to book on the company account until it is reactivated. Existing trips are unaffected.',
      confirmLabel: 'Suspend account',
      tone: 'destructive',
    });
    if (ok) setStatusMut.mutate({ id: o._id, s: 'suspended' });
  };

  const reactivate = async (o: AdminOrg) => {
    const { ok } = await confirm({
      title: `Reactivate ${o.name}?`,
      description: 'Employees can book on the company account again.',
      confirmLabel: 'Reactivate',
    });
    if (ok) setStatusMut.mutate({ id: o._id, s: 'active' });
  };

  const columns: Column<AdminOrg>[] = [
    {
      header: 'Organisation',
      cell: (o) => (
        <div>
          <p className="font-medium">{o.name}</p>
          <p className="text-xs text-muted-foreground">{o.billingEmail}{o.domain ? ` · ${o.domain}` : ''}</p>
        </div>
      ),
    },
    { header: 'Members', cell: (o) => <span className="tabular-nums">{o.members}</span> },
    { header: 'Trips', cell: (o) => <span className="tabular-nums">{o.trips}</span> },
    {
      header: 'Spend',
      cell: (o) => <span className="font-semibold tabular-nums">{formatMoney({ amount: o.totalSpend, currency: 'USD' })}</span>,
    },
    {
      header: 'Status',
      cell: (o) => <Badge tone={o.status === 'active' ? 'success' : 'destructive'}>{o.status}</Badge>,
    },
    { header: 'Joined', cell: (o) => <span className="text-xs">{formatDate(o.createdAt)}</span> },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (o) => (
        <div className="flex justify-end gap-2">
          {o.status === 'active' ? (
            <Button size="sm" variant="ghost" className="text-destructive" loading={setStatusMut.isPending} onClick={() => suspend(o)}>
              Suspend
            </Button>
          ) : (
            <Button size="sm" loading={setStatusMut.isPending} onClick={() => reactivate(o)}>
              Reactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Corporate accounts"
        description="Company workspaces, their members, and what they spend on the platform."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile tone="primary" icon={<Building2 className="h-5 w-5" />} label="Organisations" value={data?.length ?? 0} />
        <StatTile icon={<Users className="h-5 w-5" />} label="Employees covered" value={totalMembers} />
        <StatTile tone="success" icon={<TrendingUp className="h-5 w-5" />} label="Corporate spend" value={formatMoney({ amount: totalSpend, currency: 'USD' })} />
      </div>

      <div className="flex gap-2">
        {['', 'active', 'suspended'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">
            {s || 'All'}
          </Chip>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        emptyTitle="No corporate accounts"
        emptyDescription="Companies that create a workspace appear here."
      />
    </div>
  );
}
