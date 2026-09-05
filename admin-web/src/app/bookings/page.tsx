'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { formatMoney, formatDateRange } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const STATUSES = ['', 'pending_approval', 'paid', 'in_progress', 'completed', 'cancelled'];

export default function AdminBookingsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', status],
    queryFn: () => adminApi.bookings({ status: status || undefined }),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.cancelBooking(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bookings'] }),
  });

  // Irreversible + moves real money → confirm, force a typed ack, and record a
  // real operator reason (it lands in the booking's status history + audit log).
  const cancelBooking = async (b: any) => {
    const { ok, reason } = await confirm({
      title: `Cancel booking ${b.code} and refund?`,
      description: (
        <>
          This refunds <strong>{formatMoney(b.priceBreakdown.total)}</strong> to the guest and releases
          the vehicle&apos;s dates. Money movement <strong>cannot be undone</strong>.
        </>
      ),
      confirmLabel: 'Cancel + refund',
      tone: 'destructive',
      requireText: b.code,
      reason: { label: 'Reason (recorded in the audit log)', placeholder: 'e.g. Host cancelled — vehicle unavailable', required: true },
    });
    if (ok) cancel.mutate({ id: b._id, reason });
  };

  const columns: Column<any>[] = [
    { header: 'Code', cell: (b) => <span className="font-mono text-xs">{b.code}</span> },
    { header: 'Dates', cell: (b) => <span className="text-xs">{formatDateRange(b.period.start, b.period.end)}</span> },
    { header: 'Total', cell: (b) => formatMoney(b.priceBreakdown.total) },
    { header: 'Status', cell: (b) => <BookingStatusBadge status={b.status} /> },
    { header: '', className: 'text-end', cell: (b) => (
      ['pending_approval', 'confirmed', 'paid'].includes(b.status)
        ? <Button size="sm" variant="outline" className="text-destructive" loading={cancel.isPending} onClick={() => cancelBooking(b)}>Cancel + refund</Button>
        : null
    ) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Booking management</h1>
      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {STATUSES.map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s ? s.replace(/_/g, ' ') : 'All'}</Chip>
        ))}
      </div>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No bookings found" />
    </div>
  );
}
