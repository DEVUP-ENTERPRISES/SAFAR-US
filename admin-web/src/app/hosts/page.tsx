'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import { Rating } from '@/components/ui/rating';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

const TONE: Record<string, 'success' | 'warning' | 'destructive'> = {
  verified: 'success', pending: 'warning', rejected: 'destructive',
};

export default function AdminHostsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-hosts', status],
    queryFn: () => adminApi.hosts({ status: status || undefined }),
  });
  const setVerification = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => adminApi.setHostVerification(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-hosts'] }),
  });

  const decide = async (h: any, verified: boolean) => {
    const { ok } = await confirm({
      title: verified ? `Verify ${h.displayName}?` : `Reject ${h.displayName}?`,
      description: verified
        ? 'This host will be able to list vehicles and accept bookings.'
        : 'This host will not be able to list vehicles until they are verified.',
      confirmLabel: verified ? 'Verify host' : 'Reject host',
      tone: verified ? 'default' : 'destructive',
    });
    if (ok) setVerification.mutate({ id: h._id, s: verified ? 'verified' : 'rejected' });
  };

  const columns: Column<any>[] = [
    { header: 'Host', cell: (h) => (
      <div>
        <p className="font-medium">{h.displayName}</p>
        <p className="text-xs capitalize text-muted-foreground">{h.hostType}{h.isFleetOwner ? ' · fleet' : ''}</p>
      </div>
    ) },
    { header: 'Rating', cell: (h) => <Rating value={h.ratingAvg} count={h.ratingCount} /> },
    { header: 'Trips', cell: (h) => <span>{h.totalTrips}</span> },
    { header: 'Status', cell: (h) => <Badge tone={TONE[h.verificationStatus] ?? 'muted'}>{h.verificationStatus}</Badge> },
    { header: 'Actions', className: 'text-end', cell: (h) => (
      <div className="flex justify-end gap-2">
        {h.userId && (
          <Link href={adminPath(`kyc?user=${h.userId}`)}>
            <Button size="sm" variant="outline">KYC</Button>
          </Link>
        )}
        {h.verificationStatus !== 'verified' && (
          <Button size="sm" loading={setVerification.isPending} onClick={() => decide(h, true)}>Approve</Button>
        )}
        {h.verificationStatus !== 'rejected' && (
          <Button size="sm" variant="outline" className="text-destructive" loading={setVerification.isPending} onClick={() => decide(h, false)}>Reject</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Host management</h1>
      <div className="flex gap-2">
        {['', 'pending', 'verified', 'rejected'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No hosts found" />
    </div>
  );
}
