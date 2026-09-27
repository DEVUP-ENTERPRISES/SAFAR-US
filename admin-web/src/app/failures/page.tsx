'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';

const AREAS = [
  { v: '', l: 'All' },
  { v: 'booking', l: 'Booking' },
  { v: 'payment', l: 'Payment' },
  { v: 'identity', l: 'Identity' },
  { v: 'other', l: 'Other' },
];

/** Every failed booking, payment and identity attempt, and every server error, so ops sees a problem before guests report it. */
export default function FailuresPage() {
  const [area, setArea] = useState('');
  const [days, setDays] = useState(1);
  const q = useQuery({
    queryKey: ['admin-failures', area, days],
    queryFn: () => adminApi.failures({ area: area || undefined, days }),
    refetchInterval: 30_000,
  });

  const columns: Column<any>[] = [
    { header: 'When', cell: (f) => <span className="whitespace-nowrap text-xs">{new Date(f.at).toLocaleString()}</span> },
    { header: 'Area', cell: (f) => <Badge tone="muted" className="capitalize">{f.area}</Badge> },
    { header: 'Result', cell: (f) => <Badge tone={f.status >= 500 ? 'destructive' : 'warning'}>{f.status} · {f.code}</Badge> },
    { header: 'What happened', cell: (f) => <span className="text-sm">{f.message}</span> },
    { header: 'Request', cell: (f) => <span className="font-mono text-xs text-muted-foreground">{f.method} {f.path}</span> },
    { header: 'Who', cell: (f) => <span className="font-mono text-xs">{f.userId ? f.userId.slice(0, 8) : 'signed out'}{f.country ? ` · ${f.country}` : ''}</span> },
  ];

  const serverErrors = (q.data?.summary ?? []).filter((s) => s.status >= 500).reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-display-sm">Failed attempts</h1>
          <p className="text-sm text-muted-foreground">Bookings, payments and identity checks that did not go through, and every server error. Refreshes every 30 seconds.</p>
        </div>
        <Button size="sm" variant="outline" loading={q.isFetching} onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {AREAS.map((a) => <Chip key={a.v || 'all'} active={area === a.v} onClick={() => setArea(a.v)}>{a.l}</Chip>)}
        <span className="mx-1 w-px bg-border" />
        {[1, 7, 30].map((d) => <Chip key={d} active={days === d} onClick={() => setDays(d)}>{d === 1 ? 'Last 24h' : `Last ${d} days`}</Chip>)}
      </div>

      {serverErrors > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <span><span className="font-semibold">{serverErrors} server {serverErrors === 1 ? 'error' : 'errors'}</span> in this window. Staff get a push alert for each new kind.</span>
          </CardContent>
        </Card>
      )}

      {(q.data?.summary.length ?? 0) > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data!.summary.map((s) => (
            <Card key={`${s.area}-${s.code}`}>
              <CardContent className="space-y-1 py-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={s.status >= 500 ? 'destructive' : 'warning'}>{s.code}</Badge>
                  <span className="text-2xl font-bold">{s.count}</span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{s.message}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{s.area} · last {new Date(s.lastAt).toLocaleTimeString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DataTable columns={columns} rows={q.data?.items} isLoading={q.isLoading} emptyTitle="No failures in this window" emptyDescription="Good news: every booking, payment and identity attempt went through." />
    </div>
  );
}
