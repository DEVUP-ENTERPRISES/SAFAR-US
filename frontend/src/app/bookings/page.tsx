'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { useMyBookings, useCancelBooking } from '@/features/bookings/hooks';
import { bookingApi } from '@/features/bookings/api';
import { tripApi } from '@/features/trips/api';
import { formatMoney, formatDateRange } from '@/lib/utils/format';

function BookingsList() {
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useMyBookings('guest');
  const cancel = useCancelBooking();
  const [extendId, setExtendId] = useState<string | null>(null);
  const [newEnd, setNewEnd] = useState('');
  const startTrip = useMutation({
    mutationFn: (bookingId: string) => tripApi.start(bookingId),
    onSuccess: (trip) => router.push(`/trips/${trip._id}`),
  });
  const extend = useMutation({
    mutationFn: (id: string) => bookingApi.extend(id, new Date(newEnd).toISOString()),
    onSuccess: () => { setExtendId(null); setNewEnd(''); qc.invalidateQueries({ queryKey: ['bookings'] }); },
  });

  if (isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (isError) return <ErrorState message="Couldn't load your trips." retry={() => refetch()} />;
  if (!data || data.length === 0)
    return <EmptyState title="No trips yet" description="Book a vehicle to see it here." />;

  const cancellable = ['pending_approval', 'confirmed', 'paid'];

  return (
    <div className="space-y-3">
      {data.map((b) => (
        <Card key={b._id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{b.code}</span>
                <BookingStatusBadge status={b.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateRange(b.period.start, b.period.end)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => router.push(`/bookings/${b._id}/receipt`)}
                className="font-semibold hover:text-primary hover:underline"
                title="View receipt"
              >
                {formatMoney(b.priceBreakdown.total)}
              </button>
              <div className="flex items-center gap-1">
                {b.status === 'paid' && (
                  <Button size="sm" loading={startTrip.isPending} onClick={() => startTrip.mutate(b._id)}>
                    Start trip
                  </Button>
                )}
                {b.status === 'in_progress' && b.tripId && (
                  <Button size="sm" onClick={() => router.push(`/trips/${b.tripId}`)}>
                    Open trip
                  </Button>
                )}
                {['paid', 'in_progress'].includes(b.status) && (
                  <Button size="sm" variant="outline" onClick={() => { setExtendId(extendId === b._id ? null : b._id); setNewEnd(''); }}>
                    Extend
                  </Button>
                )}
                {['completed', 'cancelled'].includes(b.status) && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/vehicles/${b.vehicleId}`)}>
                    Book again
                  </Button>
                )}
                {cancellable.includes(b.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    loading={cancel.isPending}
                    onClick={async () => {
                      const { ok, reason } = await confirm({
                        title: `Cancel trip ${b.code}?`,
                        description:
                          'Your refund depends on the host’s cancellation policy. This cannot be undone — you would need to rebook.',
                        confirmLabel: 'Cancel trip',
                        tone: 'destructive',
                        reason: { label: 'Reason for cancelling', placeholder: 'e.g. Plans changed', required: true },
                      });
                      if (ok) cancel.mutate({ id: b._id, reason });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
          {extendId === b._id && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border p-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">New end date/time</label>
                <Input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
              </div>
              <Button size="sm" disabled={!newEnd} loading={extend.isPending} onClick={() => extend.mutate(b._id)}>
                Confirm extension
              </Button>
              {extend.isError && (
                <p className="w-full text-sm text-destructive">
                  {extend.error instanceof ApiError ? extend.error.message : 'Extension failed'}
                </p>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <AuthGuard>
      <div className="space-y-6">
        <h1 className="display text-display-sm">Your trips</h1>
        <BookingsList />
      </div>
    </AuthGuard>
  );
}
