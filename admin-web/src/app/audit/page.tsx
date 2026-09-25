'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';

export default function AdminAuditPage() {
  const [actor, setActor] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('actor') ?? ''));
  const staff = useQuery({ queryKey: ['admin-staff'], queryFn: () => adminApi.staff() });
  const { data, isLoading } = useQuery({ queryKey: ['admin-audit', actor], queryFn: () => adminApi.auditLogs({ limit: 100, actorId: actor || undefined }) });

  const columns: Column<any>[] = [
    { header: 'When', cell: (a) => <span className="text-xs">{new Date(a.at ?? a.createdAt).toLocaleString()}</span> },
    { header: 'Who', cell: (a) => <div><p className="text-sm font-medium">{a.actor?.name ?? 'Unknown'}</p><p className="text-xs text-muted-foreground">{(a.actorRoles ?? []).join(', ')}</p></div> },
    { header: 'Action', cell: (a) => <Badge tone="muted">{a.action}</Badge> },
    { header: 'On', cell: (a) => <span className="text-xs text-muted-foreground">{a.resourceType}{a.resourceId ? `:${String(a.resourceId).slice(0, 8)}` : ''}</span> },
    { header: 'Result', cell: (a) => <span className="text-xs">{a.status}</span> },
    { header: 'From', cell: (a) => <span className="font-mono text-xs">{a.ip ?? ''}</span> },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Audit logs</h1>
      <p className="text-sm text-muted-foreground">Immutable record of what each staff member changed. Passwords and codes are never stored.</p>
      <Select wrapperClassName="max-w-xs" value={actor} onChange={(e) => setActor(e.target.value)}>
        <option value="">All staff</option>
        {staff.data?.map((u) => <option key={u._id} value={u._id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</option>)}
      </Select>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No audit entries yet" />
    </div>
  );
}
