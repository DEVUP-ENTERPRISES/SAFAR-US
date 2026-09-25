'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { CaseFilePanel } from '@/features/ai/components/case-file-panel';
import { FileSearch } from 'lucide-react';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  opened: 'warning', investigating: 'default', approved: 'success', settled: 'success', rejected: 'destructive', closed: 'muted',
};

export default function AdminClaimsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const [settling, setSettling] = useState<{ id: string; dollars: string; currency: string } | null>(null);
  const [caseFileFor, setCaseFileFor] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-claims', status],
    queryFn: () => adminApi.claims({ status: status || undefined }),
  });
  const assign = useMutation({ mutationFn: (id: string) => adminApi.assignClaim(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-claims'] }) });
  const resolve = useMutation({
    // Note is now the adjuster's real note, not a canned string.
    mutationFn: ({ id, d, note }: { id: string; d: string; note: string }) => adminApi.resolveClaim(id, d, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-claims'] }),
  });

  const settle = useMutation({
    mutationFn: ({ id, cents, note }: { id: string; cents: number; note: string }) =>
      adminApi.settleClaim(id, { amountApproved: cents, note }),
    onSuccess: () => { setSettling(null); qc.invalidateQueries({ queryKey: ['admin-claims'] }); },
  });

  const startSettle = (c: any) =>
    setSettling({ id: c._id, dollars: String(((c.amountApproved ?? c.amountClaimed ?? 0) / 100).toFixed(2)), currency: c.currency ?? 'USD' });

  const confirmSettle = async () => {
    if (!settling) return;
    const cents = Math.round(Number(settling.dollars) * 100);
    const { ok, reason } = await confirm({
      title: 'Settle and pay out this claim?',
      description: `${formatMoney({ amount: cents, currency: settling.currency })} will be credited to the claimant's wallet and booked through the ledger as a platform expense. This moves real money and cannot be undone.`,
      confirmLabel: 'Settle & pay out',
      tone: 'destructive',
      reason: { label: 'Settlement note (recorded on the claim)', placeholder: 'e.g. Repair invoice verified', required: true },
    });
    if (ok) settle.mutate({ id: settling.id, cents, note: reason });
  };

  const decide = async (c: any, d: 'approved' | 'rejected') => {
    const approving = d === 'approved';
    const { ok, reason } = await confirm({
      title: approving ? 'Approve this claim?' : 'Reject this claim?',
      description: approving
        ? 'Approving accepts liability for this claim and moves it to settlement.'
        : 'The claimant will be told their claim was rejected, along with your note.',
      confirmLabel: approving ? 'Approve claim' : 'Reject claim',
      tone: approving ? 'default' : 'destructive',
      reason: {
        label: 'Adjuster note (recorded on the claim)',
        placeholder: approving ? 'e.g. Damage confirmed from photos' : 'e.g. Damage pre-existing per handover photos',
        required: true,
      },
    });
    if (ok) resolve.mutate({ id: c._id, d, note: reason });
  };

  const columns: Column<any>[] = [
    { header: 'Type', cell: (c) => <Badge tone="muted">{c.type}</Badge> },
    { header: 'Description', cell: (c) => <span className="line-clamp-1 max-w-xs text-xs">{c.description}</span> },
    { header: 'Evidence', cell: (c) => <span className="text-xs text-muted-foreground">{c.evidence?.length ?? 0} file(s)</span> },
    { header: 'Filed', cell: (c) => <span className="text-xs">{formatDate(c.createdAt)}</span> },
    { header: 'Status', cell: (c) => (
      <div className="flex flex-col items-start gap-0.5">
        <Badge tone={TONE[c.status] ?? 'muted'}>{c.status}</Badge>
        {c.status === 'settled' && <span className="text-xs text-muted-foreground">Paid {formatMoney({ amount: c.amountApproved ?? 0, currency: c.currency ?? 'USD' })}</span>}
      </div>
    ) },
    { header: 'Actions', className: 'text-end', cell: (c) => (
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Build case file"
          onClick={() => setCaseFileFor(caseFileFor === c._id ? null : c._id)}
        >
          <FileSearch className="h-4 w-4" />
        </Button>
        {c.status === 'opened' && <Button size="sm" variant="outline" loading={assign.isPending} onClick={() => assign.mutate(c._id)}>Investigate</Button>}
        {c.status === 'approved' && <Button size="sm" onClick={() => startSettle(c)}>Settle &amp; pay out</Button>}
        {['opened', 'investigating'].includes(c.status) && (
          <>
            <Button size="sm" loading={resolve.isPending} onClick={() => decide(c, 'approved')}>Approve</Button>
            <Button size="sm" variant="ghost" className="text-destructive" loading={resolve.isPending} onClick={() => decide(c, 'rejected')}>Reject</Button>
          </>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Claims management</h1>
      <div className="flex gap-2">
        {['', 'opened', 'investigating', 'approved', 'settled', 'rejected'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>
      {settling && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Payout amount ({settling.currency})</label>
            <Input type="number" min={0} step="0.01" value={settling.dollars} onChange={(e) => setSettling({ ...settling, dollars: e.target.value })} />
          </div>
          <Button disabled={!(Number(settling.dollars) >= 0) || settling.dollars === ''} loading={settle.isPending} onClick={confirmSettle}>Review &amp; settle</Button>
          <Button variant="ghost" onClick={() => setSettling(null)}>Cancel</Button>
        </div>
      )}
      {caseFileFor && <CaseFilePanel key={caseFileFor} claimId={caseFileFor} />}
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No claims filed" />
    </div>
  );
}
