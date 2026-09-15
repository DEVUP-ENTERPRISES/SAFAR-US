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

/**
 * Every state an operator needs to triage, not just the happy path.
 *
 * pending_verification, pending_payment and expired were missing, which meant
 * the bookings most likely to need intervention — the ones holding a vehicle's
 * dates and an authorisation on a card without ever confirming — could not be
 * filtered to at all.
 */
const STATUSES = [
  '',
  'pending_verification',
  'pending_payment',
  'pending_approval',
  'confirmed',
  'paid',
  'in_progress',
  'completed',
  'disputed',
  'cancelled',
  'declined',
  'expired',
];

/** Mirrors adminCancel's allow-list on the server. */
const CANCELLABLE = ['pending_verification', 'pending_payment', 'pending_approval', 'confirmed', 'paid'];

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
    // Only a booking whose funds were actually captured gets refunded; the
    // unpaid states only ever held an authorisation. Promising a refund on
    // those told the operator money would move when none ever had.
    const refunds = b.status === 'paid' || b.status === 'confirmed';
    const { ok, reason } = await confirm({
      title: refunds ? `Cancel booking ${b.code} and refund?` : `Cancel booking ${b.code}?`,
      description: refunds ? (
        <>
          This refunds <strong>{formatMoney(b.priceBreakdown.total)}</strong> to the guest and releases
          the vehicle&apos;s dates. Money movement <strong>cannot be undone</strong>.
        </>
      ) : (
        <>
          This booking was never paid. Cancelling releases the hold on the guest&apos;s card and frees
          the vehicle&apos;s dates. <strong>Cannot be undone.</strong>
        </>
      ),
      confirmLabel: refunds ? 'Cancel + refund' : 'Cancel booking',
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
      CANCELLABLE.includes(b.status)
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
