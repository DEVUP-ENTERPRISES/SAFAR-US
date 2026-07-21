'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi, type AdminFleet } from '@/features/admin/api';

export default function AdminFleetsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-fleets', search],
    queryFn: () => adminApi.fleets(search || undefined),
  });

  const totalVehicles = (data ?? []).reduce((s, f) => s + f.vehicles, 0);

  const columns: Column<AdminFleet>[] = [
    {
      header: 'Fleet',
      cell: (f) => (
        <div>
          <p className="font-medium">{f.name}</p>
          <p className="text-xs text-muted-foreground">{f.region ?? 'No region set'}</p>
        </div>
      ),
    },
    { header: 'Operator', cell: (f) => <span className="text-sm">{f.hostName}</span> },
    {
      header: 'Vehicles',
      cell: (f) => <span className="font-semibold tabular-nums">{f.vehicles}</span>,
    },
    { header: 'Created', cell: (f) => <span className="text-xs">{formatDate(f.createdAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supply"
        title="Fleet management"
        description="Every multi-vehicle operator on the platform, with live vehicle counts."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile tone="primary" icon={<Layers className="h-5 w-5" />} label="Fleets" value={data?.length ?? 0} />
        <StatTile label="Vehicles under fleets" value={totalVehicles} />
        <StatTile
          label="Avg fleet size"
          value={data?.length ? Math.round(totalVehicles / data.length) : 0}
          sub="Vehicles per fleet"
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Fleet or operator name…"
          className="pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        emptyTitle="No fleets"
        emptyDescription="Hosts who group vehicles into fleets appear here."
      />
    </div>
  );
}
