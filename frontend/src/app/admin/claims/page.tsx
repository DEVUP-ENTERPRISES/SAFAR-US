'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { CaseFilePanel } from '@/features/ai/components/case-file-panel';
import { FileSearch } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  opened: 'warning', investigating: 'default', approved: 'success', settled: 'success', rejected: 'destructive', closed: 'muted',
};

export default function AdminClaimsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
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
    { header: 'Status', cell: (c) => <Badge tone={TONE[c.status] ?? 'muted'}>{c.status}</Badge> },
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
        {['', 'opened', 'investigating', 'approved', 'rejected'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>
      {caseFileFor && <CaseFilePanel key={caseFileFor} claimId={caseFileFor} />}
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No claims filed" />
    </div>
  );
}
