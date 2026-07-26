'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [newEnd, setNewEnd] = useState('');
  const startTrip = useMutation({
    mutationFn: (bookingId: string) => tripApi.start(bookingId),
    onSuccess: (trip) => router.push(`/trips/${trip._id}`),
  });
  const extend = useMutation({
    mutationFn: (id: string) => bookingApi.extend(id, new Date(newEnd).toISOString()),
    onSuccess: () => { setExtendId(null); setNewEnd(''); qc.invalidateQueries({ queryKey: ['bookings'] }); },
  });
  // Live cost of the chosen extension — so the guest sees the added charge and
  // whether the dates are even free before anything is captured.
  const extPreview = useQuery({
    queryKey: ['extension-preview', extendId, newEnd],
    queryFn: () => bookingApi.extensionPreview(extendId!, new Date(newEnd).toISOString()),
    enabled: !!extendId && !!newEnd,
    retry: false,
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
                    loading={cancel.isPending || previewing === b._id}
                    onClick={async () => {
                      // Fetch the exact refund first, the way Turo does — a
                      // guest deciding whether to eat a loss deserves the real
                      // number, not "it depends on the policy".
                      setPreviewing(b._id);
                      let desc: ReactNode =
                        'This cannot be undone — you would need to rebook.';
                      try {
                        const p = await bookingApi.cancellationPreview(b._id);
                        const policyLabel = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' }[p.policy];
                        desc = (
                          <span className="block space-y-1.5">
                            <span className="block">
                              You paid <b>{formatMoney(p.total)}</b>.{' '}
                              {p.isFullRefund ? (
                                <>You’ll be refunded the <b>full {formatMoney(p.refund)}</b>.</>
                              ) : p.refund.amount > 0 ? (
                                <>You’ll be refunded <b>{formatMoney(p.refund)}</b> — {formatMoney(p.nonRefundable)} is non-refundable under this host’s {policyLabel.toLowerCase()} policy.</>
                              ) : (
                                <>This is <b>non-refundable</b> under this host’s {policyLabel.toLowerCase()} policy.</>
                              )}
                            </span>
                            {p.fullRefundUntil && !p.isFullRefund && (
                              <span className="block text-xs text-muted-foreground">
                                A full refund was available until {new Date(p.fullRefundUntil).toLocaleString()}.
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground">This cannot be undone — you would need to rebook.</span>
                          </span>
                        );
                      } catch {
                        /* fall back to the generic copy if the preview fails */
                      } finally {
                        setPreviewing(null);
                      }

                      const { ok, reason } = await confirm({
                        title: `Cancel trip ${b.code}?`,
                        description: desc,
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
                <Input type="datetime-local" value={newEnd} min={b.period.end.slice(0, 16)} onChange={(e) => setNewEnd(e.target.value)} />
              </div>
              <Button
                size="sm"
                disabled={!newEnd || !extPreview.data?.available}
                loading={extend.isPending}
                onClick={async () => {
                  const p = extPreview.data;
                  if (!p?.available || !p.extraCost) return;
                  const { ok } = await confirm({
                    title: 'Extend this trip?',
                    description: (
                      <span>
                        Extending to {new Date(p.newEnd).toLocaleString()} adds{' '}
                        <b>{formatMoney(p.extraCost)}</b>, charged now.
                      </span>
                    ),
                    confirmLabel: `Pay ${formatMoney(p.extraCost)} & extend`,
                  });
                  if (ok) extend.mutate(b._id);
                }}
              >
                Confirm extension
              </Button>
              {newEnd && extPreview.isFetching && (
                <p className="w-full text-xs text-muted-foreground">Checking availability &amp; price…</p>
              )}
              {newEnd && extPreview.data && !extPreview.data.available && (
                <p className="w-full text-sm text-destructive">{extPreview.data.reason}</p>
              )}
              {newEnd && extPreview.data?.available && extPreview.data.extraCost && (
                <p className="w-full text-sm">
                  Adds <b>{formatMoney(extPreview.data.extraCost)}</b> for the extra days.
                </p>
              )}
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
