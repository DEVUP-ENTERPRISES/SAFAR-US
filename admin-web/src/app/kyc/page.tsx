'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';
import { SecureDoc } from '@/features/media/secure-doc';

export default function AdminKycPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('pending');
  const { data, isLoading } = useQuery({ queryKey: ['admin-kyc', status], queryFn: () => adminApi.kyc({ status }) });
  const review = useMutation({
    // The backend accepts a reason — we now actually send it so rejections are explainable.
    mutationFn: ({ id, d, reason }: { id: string; d: 'approved' | 'rejected'; reason?: string }) =>
      adminApi.reviewKyc(id, d, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-kyc'] }),
  });

  const approve = async (k: any) => {
    const { ok } = await confirm({
      title: 'Approve this identity check?',
      description: 'The user becomes KYC-verified and can book immediately. Review the documents first.',
      confirmLabel: 'Approve KYC',
    });
    if (ok) review.mutate({ id: k._id, d: 'approved' });
  };

  const reject = async (k: any) => {
    const { ok, reason } = await confirm({
      title: 'Reject this identity check?',
      description: 'The user will be told their documents were rejected and asked to resubmit.',
      confirmLabel: 'Reject KYC',
      tone: 'destructive',
      reason: { label: 'Reason (shown to the user)', placeholder: 'e.g. Document is blurry / expired', required: true },
    });
    if (ok) review.mutate({ id: k._id, d: 'rejected', reason });
  };

  const columns: Column<any>[] = [
    { header: 'User', cell: (k) => <span className="font-mono text-xs">{k.userId.slice(0, 8)}</span> },
    { header: 'Level', cell: (k) => <Badge tone="muted">{k.level}</Badge> },
    { header: 'Documents', cell: (k) => (
      <div className="flex gap-1">
        {k.documents?.map((d: any, i: number) => (
          <SecureDoc key={i} url={d.url} alt={d.type} className="h-10 w-14 rounded object-cover" />
        ))}
      </div>
    ) },
    { header: 'Submitted', cell: (k) => <span className="text-xs">{formatDate(k.createdAt)}</span> },
    { header: 'Status', cell: (k) => <Badge tone={k.status === 'approved' ? 'success' : k.status === 'rejected' ? 'destructive' : 'warning'}>{k.status}</Badge> },
    { header: 'Actions', className: 'text-end', cell: (k) => (
      k.status === 'pending' ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" loading={review.isPending} onClick={() => approve(k)}>Approve</Button>
          <Button size="sm" variant="outline" className="text-destructive" loading={review.isPending} onClick={() => reject(k)}>Reject</Button>
        </div>
      ) : null
    ) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">KYC review</h1>
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No KYC submissions" />
    </div>
  );
}
