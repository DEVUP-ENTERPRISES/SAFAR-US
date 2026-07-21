'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle2, Zap, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { adminApi, type AdminPayouts } from '@/features/admin/api';

type Row = AdminPayouts['rows'][number];

export default function AdminPayoutsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', status],
    queryFn: () => adminApi.payoutQueue(status || undefined),
  });

  const runDue = useMutation({
    mutationFn: () => adminApi.runDuePayouts(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin-payouts'] });
      toast({
        tone: 'success',
        title: 'Payout run complete',
        description: `${r.paid} payout(s) released across ${r.hosts} host(s) — ${formatMoney({ amount: r.amount, currency: 'USD' })}.`,
      });
    },
  });

  const m = (v: number) => formatMoney({ amount: v, currency: 'USD' });

  const doRun = async () => {
    const { ok } = await confirm({
      title: 'Release all due payouts?',
      description:
        'Every scheduled payout past its hold window will be paid out to hosts. Money movement cannot be undone.',
      confirmLabel: 'Run payouts',
      tone: 'destructive',
      requireText: 'RELEASE',
    });
    if (ok) runDue.mutate();
  };

  const columns: Column<Row>[] = [
    {
      header: 'Host',
      cell: (p) => (
        <div>
          <p className="font-medium">{p.hostName}</p>
          <p className="font-mono text-xs text-muted-foreground">{p.hostId.slice(0, 8)}</p>
        </div>
      ),
    },
    {
      header: 'Amount',
      cell: (p) => (
        <span className="flex items-center gap-1.5 font-semibold tabular-nums">
          {formatMoney({ amount: p.amount, currency: p.currency })}
          {p.instant && (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              <Zap className="h-2.5 w-2.5" /> instant
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (p) => (
        <Badge tone={p.status === 'paid' ? 'success' : p.status === 'failed' ? 'destructive' : 'warning'}>
          {p.status}
        </Badge>
      ),
    },
    {
      header: 'When',
      cell: (p) => (
        <span className="text-xs">
          {p.paidAt ? `Paid ${formatDate(p.paidAt)}` : `Due ${formatDate(p.scheduledFor)}`}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Payouts"
        description="What the platform owes hosts and what it has already released."
        actions={
          <Button loading={runDue.isPending} onClick={doRun} disabled={!data?.totals.scheduled}>
            <Play className="h-4 w-4" /> Run due payouts
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          tone={data?.totals.scheduled ? 'warning' : 'default'}
          emphasis={!!data?.totals.scheduled}
          icon={<Clock className="h-5 w-5" />}
          label="Owed to hosts"
          value={m(data?.totals.scheduled ?? 0)}
          sub="Scheduled, awaiting release"
        />
        <StatTile
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Paid to date"
          value={m(data?.totals.paid ?? 0)}
        />
      </div>

      <div className="flex gap-2">
        {['', 'scheduled', 'paid', 'failed'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">
            {s || 'All'}
          </Chip>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data?.rows}
        isLoading={isLoading}
        emptyTitle="No payouts"
        emptyDescription="Completed trips schedule a payout to the host."
      />
    </div>
  );
}
