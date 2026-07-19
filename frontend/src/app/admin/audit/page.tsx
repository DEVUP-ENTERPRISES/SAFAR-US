'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';

export default function AdminAuditPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-audit'], queryFn: () => adminApi.auditLogs({ limit: 100 }) });

  const columns: Column<any>[] = [
    { header: 'When', cell: (a) => <span className="text-xs">{new Date(a.at ?? a.createdAt).toLocaleString()}</span> },
    { header: 'Actor', cell: (a) => <span className="font-mono text-xs">{(a.actorId ?? 'system').slice(0, 12)}</span> },
    { header: 'Action', cell: (a) => <Badge tone="muted">{a.action}</Badge> },
    { header: 'Resource', cell: (a) => <span className="text-xs text-muted-foreground">{a.resourceType}{a.resourceId ? `:${String(a.resourceId).slice(0, 8)}` : ''}</span> },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Audit logs</h1>
      <p className="text-sm text-muted-foreground">Immutable record of sensitive actions.</p>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No audit entries yet" />
    </div>
  );
}
