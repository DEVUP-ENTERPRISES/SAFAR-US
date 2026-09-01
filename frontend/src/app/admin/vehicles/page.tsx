'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatMoney } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

export default function AdminVehiclesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [verification, setVerification] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-vehicles', verification],
    queryFn: () => adminApi.vehicles({ verification: verification || undefined }),
  });
  const action = useMutation({
    mutationFn: ({ id, a }: { id: string; a: 'approve' | 'suspend' | 'reject' }) => adminApi.vehicleAction(id, a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-vehicles'] }),
  });

  const COPY = {
    approve: {
      title: 'Approve this vehicle?',
      description: 'It becomes bookable by guests immediately. Check the photos and details first.',
      confirmLabel: 'Approve vehicle',
      tone: 'default' as const,
    },
    suspend: {
      title: 'Suspend this listing?',
      description: 'It is removed from search immediately. Existing bookings are not cancelled. Reversible.',
      confirmLabel: 'Suspend listing',
      tone: 'destructive' as const,
    },
    reject: {
      title: 'Reject this vehicle?',
      description: 'The host is told the vehicle was rejected and cannot list it until it is resubmitted.',
      confirmLabel: 'Reject vehicle',
      tone: 'destructive' as const,
    },
  };

  const act = async (v: any, a: 'approve' | 'suspend' | 'reject') => {
    const { ok } = await confirm({
      ...COPY[a],
      description: (
        <>
          <strong>{v.make} {v.model}</strong> ({v.year}) — {COPY[a].description}
        </>
      ),
    });
    if (ok) action.mutate({ id: v._id, a });
  };

  const columns: Column<any>[] = [
    { header: 'Vehicle', cell: (v) => (
      <div className="flex items-center gap-3">
        {v.photos?.[0]?.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={v.photos[0].url} alt="" className="h-10 w-14 rounded object-cover" />
          : <div className="flex h-10 w-14 items-center justify-center rounded bg-muted text-xs">{v.make?.[0]}{v.model?.[0]}</div>}
        <div>
          <p className="font-medium">{v.make} {v.model}</p>
          <p className="text-xs text-muted-foreground">{v.year} · {v.location?.city}</p>
        </div>
      </div>
    ) },
    { header: 'Price', cell: (v) => formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency }) },
    { header: 'Verification', cell: (v) => <Badge tone={v.verificationStatus === 'verified' ? 'success' : 'warning'}>{v.verificationStatus}</Badge> },
    { header: 'Status', cell: (v) => <Badge tone={v.status === 'listed' ? 'success' : 'muted'}>{v.status}</Badge> },
    { header: 'Actions', className: 'text-end', cell: (v) => (
      <div className="flex justify-end gap-2">
        {v.verificationStatus !== 'verified' && (
          <Button size="sm" loading={action.isPending} onClick={() => act(v, 'approve')}>Approve</Button>
        )}
        {v.status === 'listed' && (
          <Button size="sm" variant="outline" loading={action.isPending} onClick={() => act(v, 'suspend')}>Suspend</Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive" loading={action.isPending} onClick={() => act(v, 'reject')}>Reject</Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Vehicle management</h1>
      <div className="flex gap-2">
        {['', 'pending', 'verified', 'rejected'].map((s) => (
          <Chip key={s || 'all'} active={verification === s} onClick={() => setVerification(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No vehicles found" />
    </div>
  );
}
